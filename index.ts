import KDBush from "kdbush";
import { BBox, Cluster, ClusterProperties, IPointCluster, Options, Point } from "./types";

const fround =
	Math.fround ||
	((tmp) => (x) => {
		tmp[0] = +x;
		return tmp[0];
	})(new Float32Array(1));

const OFFSET_ZOOM = 2;
const OFFSET_ID = 3;
const OFFSET_PARENT = 4;
const OFFSET_NUM = 5;
const OFFSET_PROP = 6;

export default class PointClusterImpl<P extends Record<string, any>, C extends Record<string, any>> implements IPointCluster<P, C> {
	private options: Options<P, C>;
	private trees: KDBush[];
	private stride: number;
	private clusterProps: C[] = [];
	private points: Point<P>[] = [];

	private defaultOptions: Options<P, C> = {
		minZoom: 1, // min zoom to generate clusters on
		maxZoom: 16, // max zoom level to cluster the points on
		minPoints: 2, // minimum points to form a cluster
		radius: 40, // cluster radius in pixels
		nodeSize: 64, // size of the KD-tree leaf node, affects performance
		log: false, // whether to log timing info
		// a reduce function for calculating custom cluster properties
		reduce: undefined, // (accumulated, props) => { accumulated.sum += props.sum; }
		// properties to use for individual points when running the reducer
		map: undefined, // props => ({sum: props.my_value})
	};

	constructor(options: Partial<Options<P, C>>) {
		this.options = Object.assign(Object.create(this.defaultOptions), options);
		this.trees = new Array(this.options.maxZoom + 1);
		this.stride = this.options.reduce ? 7 : 6;
	}

	load(points: Point<P>[]) {
		const { log, minZoom, maxZoom } = this.options;

		if (log) console.time("total time");

		const timerId = `prepare ${points.length} points`;
		if (log) console.time(timerId);

		this.points = points;

		// generate a cluster object for each point and index input points into a KD-tree
		const data = [];

		for (let i = 0; i < points.length; i++) {
			const p = points[i];

			const [lng, lat] = p.coordinates;
			const x = fround(lng);
			const y = fround(lat);
			// store internal point/cluster data in flat numeric arrays for performance
			data.push(
				x,
				y, // projected point coordinates
				Infinity, // the last zoom the point was processed at
				i, // index of the source feature in the original input array
				-1, // parent cluster id
				1 // number of points in a cluster
			);
			if (this.options.reduce) data.push(0); // noop
		}
		let tree = (this.trees[maxZoom + 1] = this._createTree(data));

		if (log) console.timeEnd(timerId);

		// cluster points on max zoom, then cluster the results on previous zoom, etc.;
		// results in a cluster hierarchy across zoom levels
		for (let z = maxZoom; z >= minZoom; z--) {
			const now = +Date.now();

			// create a new set of clusters for the zoom and index them with a KD-tree
			tree = this.trees[z] = this._createTree(this._cluster(tree, z));

			if (log) console.log("z%d: %d clusters in %dms", z, tree.numItems, +Date.now() - now);
		}

		if (log) console.timeEnd("total time");

		return this;
	}

	getClusters(bbox: BBox, zoom: number): (Point<P> | Cluster<C>)[] {
		const tree = this.trees[this._limitZoom(zoom)];
		const ids = tree.range(bbox[0], bbox[1], bbox[2], bbox[3]);
		const data = new tree.ArrayType(tree.data) as Float32Array;
		const clusters = [];
		for (const id of ids) {
			const k = this.stride * id;
			clusters.push(data[k + OFFSET_NUM] > 1 ? this._getClusterJSON(data, k, this.clusterProps) : this.points[data[k + OFFSET_ID]]);
		}
		return clusters;
	}

	getChildren(clusterId: number): (Point<P> | Cluster<C>)[] {
		const originId = this._getOriginId(clusterId);
		const originZoom = this._getOriginZoom(clusterId);
		const errorMsg = "No cluster with the specified id.";

		const tree = this.trees[originZoom];
		if (!tree) throw new Error(errorMsg);

		const data = new tree.ArrayType(tree.data) as Float32Array;
		if (originId * this.stride >= data.length) throw new Error(errorMsg);

		const r = this.options.radius / (originZoom - 1);
		const x = data[originId * this.stride];
		const y = data[originId * this.stride + 1];
		const ids = tree.within(x, y, r);
		const children = [];
		for (const id of ids) {
			const k = id * this.stride;
			if (data[k + OFFSET_PARENT] === clusterId) {
				children.push(data[k + OFFSET_NUM] > 1 ? this._getClusterJSON(data, k, this.clusterProps) : this.points[data[k + OFFSET_ID]]);
			}
		}

		if (children.length === 0) throw new Error(errorMsg);

		return children;
	}

	getLeaves(clusterId: number, limit?: number, offset?: number): Point<P>[] {
		limit = limit || 10;
		offset = offset || 0;

		const leaves: Point<P>[] = [];
		this._appendLeaves(leaves, clusterId, limit, offset, 0);

		return leaves;
	}

	getClusterExpansionZoom(clusterId: number): number {
		let expansionZoom = this._getOriginZoom(clusterId) - 1;
		while (expansionZoom <= this.options.maxZoom) {
			const children = this.getChildren(clusterId);
			expansionZoom++;
			if (children.length !== 1) break;
			clusterId = children[0].properties.cluster_id;
		}
		return expansionZoom;
	}

	private _appendLeaves(result: Point<P>[], clusterId: number, limit: number, offset: number, skipped: number) {
		const children = this.getChildren(clusterId);

		for (const child of children) {
			if (isCluster(child)) {
				const props = child.properties;
				if (skipped + props.point_count <= offset) {
					// skip the whole cluster
					skipped += props.point_count;
				} else {
					// enter the cluster
					skipped = this._appendLeaves(result, props.cluster_id, limit, offset, skipped);
					// exit the cluster
				}
			} else if (skipped < offset) {
				// skip a single point
				skipped++;
			} else {
				// add a single point
				result.push(child);
			}
			if (result.length === limit) break;
		}

		return skipped;
	}

	private _createTree(data: number[]): KDBush {
		const tree = new KDBush((data.length / this.stride) | 0, this.options.nodeSize, Float32Array);
		for (let i = 0; i < data.length; i += this.stride) tree.add(data[i], data[i + 1]);
		tree.finish();
		tree.data = new Float32Array(data).buffer;
		return tree;
	}

	private _limitZoom(z: number) {
		return Math.max(this.options.minZoom, Math.min(Math.floor(+z), this.options.maxZoom + 1));
	}

	private _cluster(tree: KDBush, zoom: number) {
		const { radius, map, reduce, minPoints } = this.options;
		const r = radius / zoom;
		const data = new tree.ArrayType(tree.data) as Float32Array;
		const nextData: number[] = [];
		const stride = this.stride;

		// loop through each point
		for (let i = 0; i < data.length; i += stride) {
			// if we've already visited the point at this zoom level, skip it
			if (data[i + OFFSET_ZOOM] <= zoom) continue;
			data[i + OFFSET_ZOOM] = zoom;

			// find all nearby points
			const x = data[i];
			const y = data[i + 1];
			const neighborIds = tree.within(data[i], data[i + 1], r);

			const numPointsOrigin = data[i + OFFSET_NUM];
			let numPoints = numPointsOrigin;

			// count the number of points in a potential cluster
			for (const neighborId of neighborIds) {
				const k = neighborId * stride;
				// filter out neighbors that are already processed
				if (data[k + OFFSET_ZOOM] > zoom) numPoints += data[k + OFFSET_NUM];
			}

			// if there were neighbors to merge, and there are enough points to form a cluster
			if (numPoints > numPointsOrigin && numPoints >= minPoints) {
				let wx = x * numPointsOrigin;
				let wy = y * numPointsOrigin;

				let clusterProperties;
				let clusterPropIndex = -1;

				// encode both zoom and point index on which the cluster originated -- offset by total length of features
				const id = (((i / stride) | 0) << 5) + (zoom + 1) + this.points.length;

				for (const neighborId of neighborIds) {
					const k = neighborId * stride;

					if (data[k + OFFSET_ZOOM] <= zoom) continue;
					data[k + OFFSET_ZOOM] = zoom; // save the zoom (so it doesn't get processed twice)

					const numPoints2 = data[k + OFFSET_NUM];
					wx += data[k] * numPoints2; // accumulate coordinates for calculating weighted center
					wy += data[k + 1] * numPoints2;

					data[k + OFFSET_PARENT] = id;

					if (map && reduce) {
						if (!clusterProperties) {
							clusterProperties = this._map(data, i, true);
							clusterPropIndex = this.clusterProps.length;
							this.clusterProps.push(clusterProperties);
						}
						reduce(clusterProperties, this._map(data, k));
					}
				}

				data[i + OFFSET_PARENT] = id;
				nextData.push(wx / numPoints, wy / numPoints, Infinity, id, -1, numPoints);
				if (reduce) nextData.push(clusterPropIndex);
			} else {
				// left points as unclustered
				for (let j = 0; j < stride; j++) nextData.push(data[i + j]);

				if (numPoints > 1) {
					for (const neighborId of neighborIds) {
						const k = neighborId * stride;
						if (data[k + OFFSET_ZOOM] <= zoom) continue;
						data[k + OFFSET_ZOOM] = zoom;
						for (let j = 0; j < stride; j++) nextData.push(data[k + j]);
					}
				}
			}
		}

		return nextData;
	}

	// get index of the point from which the cluster originated
	private _getOriginId(clusterId: number) {
		return (clusterId - this.points.length) >> 5;
	}

	// get zoom of the point from which the cluster originated
	private _getOriginZoom(clusterId: number) {
		return (clusterId - this.points.length) % 32;
	}

	private _map(data: Float32Array, i: number, clone?: boolean) {
		if (!this.options.map) throw new Error("map function is not defined in options.");
		if (data[i + OFFSET_NUM] > 1) {
			const props = this.clusterProps[data[i + OFFSET_PROP]];
			return clone ? Object.assign({}, props) : props;
		}
		const original = this.points[data[i + OFFSET_ID]].properties;
		const result = this.options.map(original);
		return clone && (result as any) === original ? Object.assign({}, result) : result;
	}

	private _getClusterJSON(data: Float32Array, i: number, clusterProps: C[]): Cluster<C> {
		return {
			id: data[i + OFFSET_ID],
			properties: this._getClusterProperties(data, i, clusterProps),
			coordinates: [data[i], data[i + 1]],
		};
	}

	private _getClusterProperties(data: Float32Array, i: number, clusterProps: C[]): ClusterProperties & C {
		const count = data[i + OFFSET_NUM];
		const abbrev = count >= 10000 ? `${Math.round(count / 1000)}k` : count >= 1000 ? `${Math.round(count / 100) / 10}k` : count;
		const propIndex = data[i + OFFSET_PROP];
		const properties = propIndex === -1 ? ({} as C) : Object.assign({}, clusterProps[propIndex]);

		return Object.assign<C, ClusterProperties>(properties, {
			cluster: true,
			cluster_id: data[i + OFFSET_ID],
			point_count: count,
			point_count_abbreviated: abbrev,
		});
	}
}

export function isCluster<P, C>(clusterOrPoint: Point<P> | Cluster<C>): clusterOrPoint is Cluster<C> {
	return (clusterOrPoint as Cluster<C>).properties.cluster === true;
}
