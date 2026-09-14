# CurveFinder

CurveFinder is a portfolio prototype for turning ordered, LiDAR-derived road centerline points into curvature evidence and GIS-ready line segments.

## What it does

- Reads GeoJSON point features in projected meter coordinates, ordered by `station_m`.
- Estimates signed Menger curvature over a configurable smoothing span.
- Computes radius and left/right turn direction.
- Classifies straight, gentle, moderate, and tight segments.
- Renders an interactive browser map and curvature chart.
- Exports the analyzed segments as GeoJSON.
- Includes an ArcGIS Pro Python toolbox for the same workflow.

The browser demo intentionally begins with an extracted centerline. Raw LiDAR classification and centerline extraction are upstream processing tasks and are not simulated here.

## Run the browser demo

From the repository root:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/curvefinder/`.

## Run tests

```sh
cd curvefinder
npm test
python3 -m unittest discover -s arcgis/tests
```

## Add the ArcGIS Pro toolbox

1. In ArcGIS Pro, open the Catalog pane.
2. Right-click **Toolboxes**, choose **Add Toolbox**, and select `arcgis/CurveFinder.pyt`.
3. Run **Analyze Road Curvature** against a projected point layer.
4. Choose a numeric field that orders the centerline points, such as `station_m`.

The output is a polyline feature class with `CURVE_1_M`, `RADIUS_M`, `DIRECTION`, and `CURVE_CLASS` attributes. Thresholds are demonstration defaults, not roadway design or maintenance standards.
