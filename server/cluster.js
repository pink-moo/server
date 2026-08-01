const cluster = require("node:cluster")

if (cluster.isPrimary) {
  cluster.fork()

  cluster.on("exit", (worker, code, signal) => {
    console.log("Process stopped, restarting in 3 seconds...")
    setTimeout(() => {
      cluster.fork()
    }, 3000)
  });
}
if (cluster.isWorker) {
  require("./index")
}
