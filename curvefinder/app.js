import { analyzeCurvature } from "./curvature.js";
import { createMockLidarDataset } from "./mock-lidar.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const palette = {
  straight: "#6f7f77",
  gentle: "#0f766e",
  moderate: "#b7f34a",
  tight: "#ff6238",
};

const patterns = {
  straight: "7 7",
  gentle: "none",
  moderate: "none",
  tight: "2 5",
};

const state = {
  dataset: createMockLidarDataset(),
  datasetName: "Mock LiDAR centerline",
};

const elements = {
  map: document.querySelector("#curvature-map"),
  chart: document.querySelector("#curvature-chart"),
  span: document.querySelector("#span"),
  spanValue: document.querySelector("#span-value"),
  file: document.querySelector("#geojson-file"),
  reset: document.querySelector("#reset-demo"),
  export: document.querySelector("#export-geojson"),
  datasetName: document.querySelector("#dataset-name"),
  liveStatus: document.querySelector("#live-status"),
  metrics: {
    samples: document.querySelector("#metric-samples"),
    bends: document.querySelector("#metric-bends"),
    radius: document.querySelector("#metric-radius"),
    length: document.querySelector("#metric-length"),
  },
};

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function boundsFor(samples) {
  const xs = samples.map((sample) => sample.coordinates[0]);
  const ys = samples.map((sample) => sample.coordinates[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function projector(bounds, width, height, padding) {
  const xRange = Math.max(1, bounds.maxX - bounds.minX);
  const yRange = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((width - padding * 2) / xRange, (height - padding * 2) / yRange);
  const contentWidth = xRange * scale;
  const contentHeight = yRange * scale;
  const xOffset = (width - contentWidth) / 2;
  const yOffset = (height - contentHeight) / 2;

  return ([x, y]) => [
    xOffset + (x - bounds.minX) * scale,
    height - yOffset - (y - bounds.minY) * scale,
  ];
}

function renderMap(result) {
  const width = 760;
  const height = 420;
  const project = projector(boundsFor(result.samples), width, height, 54);
  elements.map.replaceChildren();

  const title = svgElement("title");
  title.textContent = "Plan view of the mock road centerline, classified by curvature";
  const description = svgElement("desc");
  description.textContent = "Line width, dash pattern, and color distinguish straight, gentle, moderate, and tight road segments.";
  elements.map.append(title, description);

  for (let x = 70; x < width; x += 80) {
    elements.map.append(svgElement("line", { x1: x, y1: 0, x2: x, y2: height, class: "map-grid" }));
  }
  for (let y = 50; y < height; y += 70) {
    elements.map.append(svgElement("line", { x1: 0, y1: y, x2: width, y2: y, class: "map-grid" }));
  }

  result.segments.features.forEach((segment) => {
    const [start, end] = segment.geometry.coordinates.map(project);
    const classification = segment.properties.classification;
    elements.map.append(svgElement("line", {
      x1: start[0],
      y1: start[1],
      x2: end[0],
      y2: end[1],
      stroke: palette[classification],
      "stroke-width": classification === "tight" ? 11 : classification === "moderate" ? 9 : 7,
      "stroke-dasharray": patterns[classification],
      "stroke-linecap": "round",
      class: "road-segment",
    }));
  });

  result.samples.forEach((sample, index) => {
    if (index % 2 !== 0) return;
    const [cx, cy] = project(sample.coordinates);
    elements.map.append(svgElement("circle", {
      cx,
      cy,
      r: 2.5,
      class: "sample-point",
    }));
  });

  const north = svgElement("text", { x: width - 42, y: 42, class: "north-label" });
  north.textContent = "N ↑";
  elements.map.append(north);
}

function renderChart(result) {
  const width = 760;
  const height = 260;
  const padding = { left: 58, right: 24, top: 22, bottom: 42 };
  const maxStation = result.metrics.roadLength;
  const maxMagnitude = Math.max(0.001, result.metrics.maxAbsCurvature * 1.12);
  const xScale = (station) => padding.left + (station / maxStation) * (width - padding.left - padding.right);
  const yScale = (curvature) => padding.top + ((maxMagnitude - curvature) / (maxMagnitude * 2)) * (height - padding.top - padding.bottom);
  elements.chart.replaceChildren();

  const title = svgElement("title");
  title.textContent = "Signed curvature profile by distance";
  const description = svgElement("desc");
  description.textContent = "Positive values indicate left bends and negative values indicate right bends. Peaks indicate tighter curves.";
  elements.chart.append(title, description);

  [-maxMagnitude, 0, maxMagnitude].forEach((value) => {
    const y = yScale(value);
    elements.chart.append(svgElement("line", {
      x1: padding.left,
      y1: y,
      x2: width - padding.right,
      y2: y,
      class: value === 0 ? "chart-zero" : "chart-grid",
    }));
    const label = svgElement("text", { x: padding.left - 9, y: y + 4, class: "axis-label", "text-anchor": "end" });
    label.textContent = value.toFixed(3);
    elements.chart.append(label);
  });

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const station = maxStation * ratio;
    const x = xScale(station);
    const label = svgElement("text", { x, y: height - 15, class: "axis-label", "text-anchor": "middle" });
    label.textContent = `${Math.round(station)}m`;
    elements.chart.append(label);
  });

  const points = result.samples.map((sample) => `${xScale(sample.station)},${yScale(sample.curvature)}`).join(" ");
  elements.chart.append(svgElement("polyline", {
    points,
    fill: "none",
    stroke: "#073b28",
    "stroke-width": 3,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
  }));

  result.samples.filter((sample) => sample.radius !== null).forEach((sample) => {
    elements.chart.append(svgElement("circle", {
      cx: xScale(sample.station),
      cy: yScale(sample.curvature),
      r: sample.classification === "tight" ? 5 : 3.5,
      fill: palette[sample.classification],
      stroke: "#073b28",
      "stroke-width": 1.5,
    }));
  });

  const leftLabel = svgElement("text", { x: padding.left + 5, y: padding.top + 11, class: "direction-label" });
  leftLabel.textContent = "LEFT BEND +";
  const rightLabel = svgElement("text", { x: padding.left + 5, y: height - padding.bottom - 8, class: "direction-label" });
  rightLabel.textContent = "RIGHT BEND −";
  elements.chart.append(leftLabel, rightLabel);
}

function updateMetrics(result) {
  elements.metrics.samples.textContent = result.metrics.sampleCount;
  elements.metrics.bends.textContent = result.metrics.bendsDetected;
  elements.metrics.radius.textContent = result.metrics.minRadius === null ? "—" : `${result.metrics.minRadius.toFixed(1)} m`;
  elements.metrics.length.textContent = `${result.metrics.roadLength.toFixed(0)} m`;
}

function render() {
  try {
    const span = Number(elements.span.value);
    const result = analyzeCurvature(state.dataset, { span });
    state.result = result;
    elements.spanValue.textContent = `${span} sample${span === 1 ? "" : "s"}`;
    elements.datasetName.textContent = state.datasetName;
    renderMap(result);
    renderChart(result);
    updateMetrics(result);
    elements.liveStatus.textContent = `${state.datasetName} analyzed: ${result.metrics.bendsDetected} bends detected.`;
  } catch (error) {
    elements.liveStatus.textContent = `Could not analyze this file: ${error.message}`;
  }
}

elements.span.addEventListener("input", render);

elements.file.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    state.dataset = JSON.parse(await file.text());
    state.datasetName = file.name;
    render();
  } catch (error) {
    elements.liveStatus.textContent = `Could not read ${file.name}: ${error.message}`;
  }
});

elements.reset.addEventListener("click", () => {
  state.dataset = createMockLidarDataset();
  state.datasetName = "Mock LiDAR centerline";
  elements.file.value = "";
  elements.span.value = "2";
  render();
});

elements.export.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.result.segments, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "curvefinder-segments.geojson";
  link.click();
  URL.revokeObjectURL(url);
});

render();
