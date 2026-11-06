// Adds an item "from another device" on the mock server, which pushes it over the event stream.
http.post('http://127.0.0.1:8787/api/v1/mock/remote-item', {
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer slt_cloud_mock' },
  body: JSON.stringify({ label: LABEL }),
})
