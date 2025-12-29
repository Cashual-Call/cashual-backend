module.exports = {
    apps: [{
      name: "cashual-backend",
      script: "dist/index.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production"
      }
    }]
  }
  