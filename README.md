# point-cluster [![npm version](https://img.shields.io/npm/v/@martini024/point-cluster.svg)](https://www.npmjs.com/package/@martini024/point-cluster)

**point-cluster** is a 2D Cartesian coordinate clustering library derived from [supercluster](https://github.com/mapbox/supercluster). 

**supercluster** uses geospatial points designed for Earth's curved surface, but this introduces distortions when applied to 2D spaces. These distortions occur because geospatial systems scale distances inconsistently, especially near the poles, making clustering radii inaccurate.

**point-cluster** removes these geospatial constraints, ensuring accurate and consistent clustering in 2D Cartesian applications. Whether for flat maps, floor plans, or other 2D visualizations, it delivers high performance and flexibility for interactive zoomable visualizations.

---

## Installation

Install via npm:

```bash
npm install @martini024/point-cluster
```

---

## Usage

```javascript
import { PointCluster } from '@martini024/point-cluster';

const points = [
  { coordinates: [10, 20], properties: {} },
  { coordinates: [15, 25], properties: {} },
  { coordinates: [30, 40], properties: {} },
];

const cluster = new PointCluster({
  radius: 40,
  minZoom: 1,
  maxZoom: 16,
});

const clusters = cluster.getClusters([minX, minY, maxX, maxY], zoom);
```

---

## Configuration Options

| Option            | Type                                 | Default     | Description                                                                        |
| ----------------- | ------------------------------------ | ----------- | ---------------------------------------------------------------------------------- |
| `radius`          | `number`                             | `40`        | Clustering radius in pixels.                                                       |
| `minZoom`         | `number`                             | `1`         | Minimum zoom level at which clusters are generated.                                |
| `maxZoom`         | `number`                             | `16`        | Maximum zoom level at which clusters are generated.                                |
| `minPoints`       | `number`                             | `2`         | Minimum number of points to form a cluster.                                        |
| `nodeSize`        | `number`                             | `64`        | Size of the KD-tree leaf node. Affects performance.                                |
| `log`             | `boolean`                            | `false`     | Whether timing info should be logged.                                              |
| `scalingFunction` | `(zoom: number) => number`           | `1 / zoom`  | A function that returns the scaling factor for the radius based on the zoom level. |
| `map`             | `(props: P) => C`                    | `undefined` | A function that returns cluster properties corresponding to a single point.        |
| `reduce`          | `(accumulated: C, props: C) => void` | `undefined` | A reduce function that merges properties of two clusters into one.                 |


### Custom Scaling Functions

Define a custom scaling function for the clustering radius:

```javascript
const customScale = (zoom) => Math.pow(2, -zoom);
const cluster = new PointCluster({ scalingFunction: customScale });
```

### Property Map/Reduce Options

In addition to the options above, you can aggregate properties using:

- `map`: a function to generate cluster properties from a single point.
- `reduce`: a function to merge properties of clusters.

Example of setting up a `sum` cluster property to accumulate `myValue`:

```javascript
const cluster = new PointCluster({
    map: (props) => ({ sum: props.myValue }),
    reduce: (accumulated, props) => { accumulated.sum += props.sum; }
});
```

Conditions for correct usage:

- `map` must return a new object, not the existing `properties` of a point, to prevent overwriting.
- `reduce` must not mutate the second argument (`props`).

---

## Methods

#### `load(points: Point[]): void`

Loads an array of points into the clustering system. Once loaded, the index is immutable.

#### `getClusters(bbox: BBox, zoom: number): (Point | Cluster)[]`

For the given bbox array ([minX, minY, maxX, maxY]) and zoom, returns an array of clusters and points.

#### `getChildren(clusterId: number): (Point | Cluster)[]`

Retrieves children of a specific cluster at the next zoom level. Throws an error if the cluster ID does not exist.

#### `getLeaves(clusterId: number, limit?: number, offset?: number): Point[]`

Returns all the points of a cluster (given its `cluster_id`), with pagination support:
`limit` is the number of points to return (set to `Infinity` for all points),
and `offset` is the amount of points to skip (for pagination). Throws an error if the cluster ID does not exist.

#### `getClusterExpansionZoom(clusterId: number): number`

Returns the zoom on which the cluster expands into several children (useful for "click to zoom" feature) given the cluster's `cluster_id`. Throws an error if the cluster ID does not exist.

---

## License

This project is licensed under the ISC License. See the [LICENSE](./LICENSE) file for full details, including attribution to [supercluster](https://github.com/mapbox/supercluster).

---

## Example Visualization

Combine with libraries like **Three.js** or **D3.js** to create interactive visualizations of clusters. For example, use the cluster output to render dynamic elements on a map or canvas.

---

Happy clustering! 🚀
