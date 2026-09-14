import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCurvature, signedMengerCurvature } from "../curvature.js";
import { createMockLidarDataset } from "../mock-lidar.js";

function pointsOnCircle(radius, count = 9) {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI / 2) * (index / (count - 1));
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [radius * Math.cos(angle), radius * Math.sin(angle)] },
        properties: { station_m: index },
      };
    }),
  };
}

test("signed Menger curvature is reciprocal radius for a circle", () => {
  const radius = 50;
  const angle = Math.PI / 4;
  const curvature = signedMengerCurvature(
    [radius, 0],
    [radius * Math.cos(angle), radius * Math.sin(angle)],
    [0, radius],
  );
  assert.ok(Math.abs(curvature - 1 / radius) < 1e-10);
});

test("a circular centerline produces its known radius", () => {
  const result = analyzeCurvature(pointsOnCircle(50), { span: 1, straightThreshold: 0.0001 });
  const radii = result.samples.filter((sample) => sample.radius !== null).map((sample) => sample.radius);
  radii.forEach((radius) => assert.ok(Math.abs(radius - 50) < 1e-8));
  assert.equal(result.metrics.bendsDetected, 1);
});

test("straight samples are not reported as bends", () => {
  const data = {
    type: "FeatureCollection",
    features: Array.from({ length: 7 }, (_, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [index * 5, 0] },
      properties: { station_m: index * 5 },
    })),
  };
  const result = analyzeCurvature(data, { span: 1 });
  assert.equal(result.metrics.bendsDetected, 0);
  assert.equal(result.metrics.minRadius, null);
  assert.ok(result.segments.features.every((segment) => segment.properties.classification === "straight"));
});

test("mock LiDAR data becomes a GIS-ready segment collection", () => {
  const data = createMockLidarDataset();
  const result = analyzeCurvature(data, { span: 2 });
  assert.equal(result.metrics.sampleCount, 49);
  assert.equal(result.segments.type, "FeatureCollection");
  assert.equal(result.segments.features.length, 48);
  assert.ok(result.metrics.bendsDetected > 1);
  assert.ok(result.metrics.minRadius > 0);
});
