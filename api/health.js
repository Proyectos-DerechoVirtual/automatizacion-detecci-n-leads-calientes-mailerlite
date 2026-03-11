export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'leads-calientes-detector',
    timestamp: new Date().toISOString(),
  });
}
