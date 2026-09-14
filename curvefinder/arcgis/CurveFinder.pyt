"""ArcGIS Pro Python toolbox for creating a curvature-classified road layer."""

import os
import sys

import arcpy

sys.path.insert(0, os.path.dirname(__file__))

from curvefinder_core import analyze_points, count_bends  # noqa: E402


class Toolbox:
    def __init__(self):
        self.label = "CurveFinder"
        self.alias = "curvefinder"
        self.tools = [AnalyzeRoadCurvature]


class AnalyzeRoadCurvature:
    def __init__(self):
        self.label = "Analyze Road Curvature"
        self.description = (
            "Convert ordered, projected LiDAR-derived centerline points into "
            "line segments with curvature, radius, direction, and class attributes."
        )
        self.canRunInBackground = False

    def getParameterInfo(self):
        input_points = arcpy.Parameter(
            displayName="Input centerline points",
            name="input_points",
            datatype="GPFeatureLayer",
            parameterType="Required",
            direction="Input",
        )
        input_points.filter.list = ["Point"]

        station_field = arcpy.Parameter(
            displayName="Station/order field",
            name="station_field",
            datatype="Field",
            parameterType="Required",
            direction="Input",
        )
        station_field.parameterDependencies = [input_points.name]

        span = arcpy.Parameter(
            displayName="Smoothing span (points on each side)",
            name="span",
            datatype="GPLong",
            parameterType="Optional",
            direction="Input",
        )
        span.value = 2
        span.filter.type = "Range"
        span.filter.list = [1, 20]

        straight_threshold = arcpy.Parameter(
            displayName="Straight-line curvature threshold (1 / map unit)",
            name="straight_threshold",
            datatype="GPDouble",
            parameterType="Optional",
            direction="Input",
        )
        straight_threshold.value = 0.0012

        output_segments = arcpy.Parameter(
            displayName="Output curvature segments",
            name="output_segments",
            datatype="DEFeatureClass",
            parameterType="Required",
            direction="Output",
        )

        return [input_points, station_field, span, straight_threshold, output_segments]

    def isLicensed(self):
        return True

    def updateMessages(self, parameters):
        input_value = parameters[0].valueAsText
        if not input_value:
            return
        description = arcpy.Describe(input_value)
        if description.spatialReference.type != "Projected":
            parameters[0].setErrorMessage(
                "Use a projected coordinate system so curvature and radius have linear units."
            )

    def execute(self, parameters, messages):
        input_points = parameters[0].valueAsText
        station_field = parameters[1].valueAsText
        span = int(parameters[2].value or 2)
        threshold = float(parameters[3].value or 0.0012)
        output_segments = parameters[4].valueAsText
        description = arcpy.Describe(input_points)

        rows = []
        with arcpy.da.SearchCursor(input_points, ["SHAPE@XY", station_field]) as cursor:
            for xy, station in cursor:
                if xy and station is not None:
                    rows.append((float(station), xy))
        rows.sort(key=lambda row: row[0])

        if len(rows) < span * 2 + 1:
            raise arcpy.ExecuteError(
                f"A span of {span} requires at least {span * 2 + 1} valid ordered points."
            )

        samples = analyze_points([row[1] for row in rows], span, threshold)
        output_path, output_name = os.path.split(output_segments)
        arcpy.management.CreateFeatureclass(
            output_path,
            output_name,
            "POLYLINE",
            spatial_reference=description.spatialReference,
        )
        arcpy.management.AddField(output_segments, "START_M", "DOUBLE")
        arcpy.management.AddField(output_segments, "END_M", "DOUBLE")
        arcpy.management.AddField(output_segments, "CURVE_1_M", "DOUBLE")
        arcpy.management.AddField(output_segments, "RADIUS_M", "DOUBLE")
        arcpy.management.AddField(output_segments, "DIRECTION", "TEXT", field_length=10)
        arcpy.management.AddField(output_segments, "CURVE_CLASS", "TEXT", field_length=12)

        fields = [
            "SHAPE@",
            "START_M",
            "END_M",
            "CURVE_1_M",
            "RADIUS_M",
            "DIRECTION",
            "CURVE_CLASS",
        ]
        with arcpy.da.InsertCursor(output_segments, fields) as cursor:
            for current, following in zip(samples, samples[1:]):
                analyzed = [sample for sample in (current, following) if sample.radius_m is not None]
                curvature = (
                    sum(sample.curvature_1_m for sample in analyzed) / len(analyzed)
                    if analyzed
                    else 0.0
                )
                if abs(curvature) < threshold:
                    radius = None
                    direction = "straight"
                    classification = "straight"
                else:
                    radius = 1.0 / abs(curvature)
                    direction = "left" if curvature > 0 else "right"
                    classification = (
                        "tight" if radius < 55 else "moderate" if radius < 100 else "gentle"
                    )

                geometry = arcpy.Polyline(
                    arcpy.Array(
                        [
                            arcpy.Point(current.x, current.y),
                            arcpy.Point(following.x, following.y),
                        ]
                    ),
                    description.spatialReference,
                )
                cursor.insertRow(
                    [
                        geometry,
                        current.station_m,
                        following.station_m,
                        curvature,
                        radius,
                        direction,
                        classification,
                    ]
                )

        radii = [sample.radius_m for sample in samples if sample.radius_m is not None]
        min_radius = min(radii) if radii else None
        messages.addMessage(f"Created {len(samples) - 1} curvature segments.")
        messages.addMessage(f"Detected {count_bends(samples)} bends.")
        if min_radius is not None:
            messages.addMessage(f"Minimum fitted radius: {min_radius:.2f} map units.")

        parameters[4].value = output_segments
