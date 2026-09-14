const DEFAULT_OPTIONS = Object.freeze({
  span: 2,
  straightThreshold: 0.0012,
});

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function signedMengerCurvature(a, b, c) {
  const ab = distance(a, b);
  const bc = distance(b, c);
  const ac = distance(a, c);
  const denominator = ab * bc * ac;

  if (denominator === 0) return 0;

  const twiceSignedArea =
    (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);

  return (2 * twiceSignedArea) / denominator;
}

function classifyCurvature(curvature, straightThreshold) {
  const magnitude = Math.abs(curvature);
  if (magnitude < straightThreshold) return "straight";

  const radius = 1 / magnitude;
  if (radius < 55) return "tight";
  if (radius < 100) return "moderate";
  return "gentle";
}

function normalizePoints(input) {
  const features = input?.type === "FeatureCollection" ? input.features : input;
  if (!Array.isArray(features)) {
    throw new TypeError("Expected a GeoJSON FeatureCollection or an array of point features.");
  }

  const points = features.map((feature, index) => {
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== "Point" || !Array.isArray(coordinates)) {
      throw new TypeError(`Feature ${index + 1} is not a GeoJSON Point.`);
    }
    if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
      throw new TypeError(`Feature ${index + 1} has invalid coordinates.`);
    }
    return {
      coordinates,
      properties: { ...feature.properties },
    };
  });

  if (points.length < 3) {
    throw new RangeError("At least three ordered centerline points are required.");
  }

  return points.sort((left, right) => {
    const leftStation = left.properties.station_m;
    const rightStation = right.properties.station_m;
    if (Number.isFinite(leftStation) && Number.isFinite(rightStation)) {
      return leftStation - rightStation;
    }
    return 0;
  });
}

function countBends(samples) {
  let count = 0;
  let activeDirection = null;

  for (const sample of samples) {
    if (sample.classification === "straight") {
      activeDirection = null;
      continue;
    }

    const direction = sample.curvature > 0 ? "left" : "right";
    if (direction !== activeDirection) {
      count += 1;
      activeDirection = direction;
    }
  }

  return count;
}

export function analyzeCurvature(input, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const span = Math.max(1, Math.floor(config.span));
  const straightThreshold = Math.max(0, config.straightThreshold);
  const points = normalizePoints(input);

  if (points.length < span * 2 + 1) {
    throw new RangeError(`A span of ${span} requires at least ${span * 2 + 1} points.`);
  }

  let station = 0;
  const stations = points.map((point, index) => {
    if (index > 0) station += distance(points[index - 1].coordinates, point.coordinates);
    return station;
  });

  const samples = points.map((point, index) => {
    if (index < span || index >= points.length - span) {
      return {
        ...point,
        station: stations[index],
        curvature: 0,
        radius: null,
        direction: "straight",
        classification: "straight",
        analyzed: false,
      };
    }

    const curvature = signedMengerCurvature(
      points[index - span].coordinates,
      point.coordinates,
      points[index + span].coordinates,
    );
    const classification = classifyCurvature(curvature, straightThreshold);
    const isStraight = classification === "straight";

    return {
      ...point,
      station: stations[index],
      curvature: isStraight ? 0 : curvature,
      radius: isStraight ? null : 1 / Math.abs(curvature),
      direction: isStraight ? "straight" : curvature > 0 ? "left" : "right",
      classification,
      analyzed: true,
    };
  });

  const curvedSamples = samples.filter((sample) => sample.radius !== null);
  const minRadius = curvedSamples.length
    ? Math.min(...curvedSamples.map((sample) => sample.radius))
    : null;
  const maxAbsCurvature = curvedSamples.length
    ? Math.max(...curvedSamples.map((sample) => Math.abs(sample.curvature)))
    : 0;

  const segments = samples.slice(0, -1).map((sample, index) => {
    const next = samples[index + 1];
    const candidates = [sample, next].filter((item) => item.analyzed);
    const curvature = candidates.length
      ? candidates.reduce((sum, item) => sum + item.curvature, 0) / candidates.length
      : 0;
    const classification = classifyCurvature(curvature, straightThreshold);

    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [sample.coordinates, next.coordinates],
      },
      properties: {
        start_m: Number(sample.station.toFixed(3)),
        end_m: Number(next.station.toFixed(3)),
        curvature_1_m: Number(curvature.toFixed(7)),
        radius_m: classification === "straight" ? null : Number((1 / Math.abs(curvature)).toFixed(2)),
        direction: classification === "straight" ? "straight" : curvature > 0 ? "left" : "right",
        classification,
      },
    };
  });

  return {
    samples,
    segments: {
      type: "FeatureCollection",
      name: "curvefinder_segments",
      features: segments,
    },
    metrics: {
      sampleCount: points.length,
      analyzedCount: samples.filter((sample) => sample.analyzed).length,
      roadLength: stations.at(-1),
      bendsDetected: countBends(samples),
      minRadius,
      maxAbsCurvature,
    },
  };
}

export { classifyCurvature, signedMengerCurvature };
