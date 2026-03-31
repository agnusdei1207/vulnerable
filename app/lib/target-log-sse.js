const SSE_RETRY_MS = 1500;

function createStreamHandler({ snapshot, addClient, removeClient }) {
  return function streamHandler(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    });

    res.write(`retry: ${SSE_RETRY_MS}\n`);
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);

    addClient(res);

    req.on('close', () => {
      removeClient(res);
    });
  };
}

module.exports = {
  createStreamHandler
};
