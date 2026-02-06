// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { string } from "rollup-plugin-string";

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
		})
	]
};