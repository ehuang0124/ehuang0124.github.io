"""Dependency-free curvature analysis shared by the ArcGIS toolbox tests."""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from typing import Iterable, List, Optional, Sequence


@dataclass(frozen=True)
class CurvatureSample:
    x: float
    y: float
    station_m: float
    curvature_1_m: float
    radius_m: Optional[float]
    direction: str
    classification: str


def signed_menger_curvature(
    first: Sequence[float], middle: Sequence[float], last: Sequence[float]
) -> float:
    """Return signed curvature for three 2D points, in reciprocal coordinate units."""
    ab = hypot(middle[0] - first[0], middle[1] - first[1])
    bc = hypot(last[0] - middle[0], last[1] - middle[1])
    ac = hypot(last[0] - first[0], last[1] - first[1])
    denominator = ab * bc * ac
    if denominator == 0:
        return 0.0

    twice_signed_area = (
        (middle[0] - first[0]) * (last[1] - first[1])
        - (middle[1] - first[1]) * (last[0] - first[0])
    )
    return (2.0 * twice_signed_area) / denominator


def classify_curvature(curvature: float, straight_threshold: float) -> str:
    magnitude = abs(curvature)
    if magnitude < straight_threshold:
        return "straight"
    radius = 1.0 / magnitude
    if radius < 55:
        return "tight"
    if radius < 100:
        return "moderate"
    return "gentle"


def analyze_points(
    points: Iterable[Sequence[float]], span: int = 2, straight_threshold: float = 0.0012
) -> List[CurvatureSample]:
    """Analyze ordered projected XY points and return per-point curvature samples."""
    coordinates = [(float(point[0]), float(point[1])) for point in points]
    span = max(1, int(span))
    if len(coordinates) < span * 2 + 1:
        raise ValueError(f"A span of {span} requires at least {span * 2 + 1} points")

    stations = [0.0]
    for previous, current in zip(coordinates, coordinates[1:]):
        stations.append(stations[-1] + hypot(current[0] - previous[0], current[1] - previous[1]))

    samples: List[CurvatureSample] = []
    for index, coordinate in enumerate(coordinates):
        curvature = 0.0
        if span <= index < len(coordinates) - span:
            curvature = signed_menger_curvature(
                coordinates[index - span], coordinate, coordinates[index + span]
            )

        classification = classify_curvature(curvature, straight_threshold)
        if classification == "straight":
            curvature = 0.0
            radius = None
            direction = "straight"
        else:
            radius = 1.0 / abs(curvature)
            direction = "left" if curvature > 0 else "right"

        samples.append(
            CurvatureSample(
                x=coordinate[0],
                y=coordinate[1],
                station_m=stations[index],
                curvature_1_m=curvature,
                radius_m=radius,
                direction=direction,
                classification=classification,
            )
        )

    return samples


def count_bends(samples: Iterable[CurvatureSample]) -> int:
    count = 0
    active_direction = None
    for sample in samples:
        if sample.classification == "straight":
            active_direction = None
            continue
        if sample.direction != active_direction:
            count += 1
            active_direction = sample.direction
    return count
