module.exports = {
	apps: [
		{
			name: "cashual-backend",
			script: "src/index.ts",
			interpreter: "bun",
			exec_mode: "cluster",
			instances: "max",
			env: {
				NODE_ENV: "production",
			},
		},
	],
};
