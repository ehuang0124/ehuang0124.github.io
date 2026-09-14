export function createMockLidarDataset(sampleCount = 49) {
  const features = Array.from({ length: sampleCount }, (_, index) => {
    const x = index * 5;
    const y = 22 * Math.sin(x / 55) + 8 * Math.sin((x - 25) / 22);
    const z = 100 + x * 0.008 + 0.45 * Math.sin(x / 31);
    const intensity = Math.round(112 + 18 * Math.sin(index * 1.7));

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
      },
      properties: {
        sample_id: `LDR-${String(index + 1).padStart(3, "0")}`,
        station_m: x,
        intensity,
        source: "mock LiDAR-derived centerline",
      },
    };
  });

  return {
    type: "FeatureCollection",
    name: "mock_lidar_centerline",
    crs: {
      type: "name",
      properties: { name: "LOCAL_METERS" },
    },
    features,
  };
}
