import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const config = (file, plugins) => ({
	input: "index.ts",
	output: {
		format: "umd",
		indent: false,
		file,
	},
	plugins,
});

export default [config("dist/point-cluster.js", [typescript()]), config("dist/point-cluster.min.js", [terser(), typescript()])];
