export interface Options<P, C> {
	/**
	 * Minimum zoom level at which clusters are generated.
	 *
	 * @default 1
	 */
	minZoom: number;

	/**
	 * Maximum zoom level at which clusters are generated.
	 *
	 * @default 16
	 */
	maxZoom: number;

	/**
	 * Minimum number of points to form a cluster.
	 *
	 * @default 2
	 */
	minPoints: number;

	/**
	 * Cluster radius, in pixels.
	 *
	 * @default 40
	 */
	radius: number;

	/**
	 * Size of the KD-tree leaf node. Affects performance.
	 *
	 * @default 64
	 */
	nodeSize: number;

	/**
	 * Whether timing info should be logged.
	 *
	 * @default false
	 */
	log: boolean;

	/**
	 * A function that returns cluster properties corresponding to a single point.
	 *
	 * @example
	 * (props) => ({sum: props.myValue})
	 */
	map?: ((props: P) => C) | undefined;

	/**
	 * A reduce function that merges properties of two clusters into one.
	 *
	 * @example
	 * (accumulated, props) => { accumulated.sum += props.sum; }
	 */
	reduce?: ((accumulated: C, props: Readonly<C>) => void) | undefined;
}

export type Position = [number, number];

export interface Point<P> {
	id?: string | number | undefined;
	coordinates: Position;
	properties: P;
}

export interface ClusterProperties {
	/**
	 * Always `true` to indicate that the Feature is a Cluster and not
	 * an individual point.
	 */
	cluster: true;
	/** Cluster ID */
	cluster_id: number;
	/** Number of points in the cluster. */
	point_count: number;
	/**
	 * Abbreviated number of points in the cluster as string if the number
	 * is 1000 or greater (e.g. `1.3k` if the number is 1298).
	 *
	 * For less than 1000 points it is the same value as `point_count`.
	 */
	point_count_abbreviated: string | number;
}

export type Cluster<C> = Point<ClusterProperties & C>;

// [minX, minY, maxX, maxY]
export type BBox = [number, number, number, number];

export interface IPointCluster<P extends Record<string, any>, C extends Record<string, any>> {
	/**
	 * Loads an array of GeoJSON Feature objects. Each feature's geometry
	 * must be a GeoJSON Point. Once loaded, the index is immutable.
	 *
	 * @param points Array of GeoJSON Features, the geometries being GeoJSON Points.
	 */
	load(points: Array<Point<P>>): IPointCluster<P, C>;

	/**
	 * Returns an array of clusters and points as `GeoJSON.Feature` objects
	 * for the given bounding box (`bbox`) and zoom level (`zoom`).
	 *
	 * @param bbox Bounding box (`[westLng, southLat, eastLng, northLat]`).
	 * @param zoom Zoom level.
	 */
	getClusters(bbox: BBox, zoom: number): Array<Cluster<C> | Point<P>>;

	/**
	 * Returns the children of a cluster (on the next zoom level).
	 *
	 * @param clusterId Cluster ID (`cluster_id` value from feature properties).
	 * @throws {Error} If `clusterId` does not exist.
	 */
	getChildren(clusterId: number): Array<Cluster<C> | Point<P>>;

	/**
	 * Returns all the points of a cluster (with pagination support).
	 *
	 * @param clusterId Cluster ID (`cluster_id` value from feature properties).
	 * @param limit The number of points to return (set to `Infinity` for all points).
	 * @param offset The amount of points to skip (for pagination).
	 * @throws {Error} If `clusterId` does not exist.
	 */
	getLeaves(clusterId: number, limit?: number, offset?: number): Array<Point<P>>;

	/**
	 * Returns the zoom level on which the cluster expands into several
	 * children (useful for "click to zoom" feature).
	 *
	 * @param clusterId Cluster ID (`cluster_id` value from feature properties).
	 * @throws {Error} If `clusterId` does not exist.
	 */
	getClusterExpansionZoom(clusterId: number): number;
}
