// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { string } from "rollup-plugin-string";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
	input: 'src/script.ts',
	output: {
		file: 'dist/script.js',
		format: 'es'
	},
    plugins: [
		typescript(),
		string({
			include: "src/*.txt"
		}),
		nodeResolve(),
		commonjs()
	]
};