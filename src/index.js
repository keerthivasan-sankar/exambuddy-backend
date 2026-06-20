// Cloudflare Worker Proxy Code
export default {
  async fetch(request) {
    // Handle OPTIONS requests (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Get the original request details
    const url = new URL(request.url);
    const backendUrl = 'https://exambuddy-backend-production-07e8.up.railway.app';

    // Create a new request for your backend
    const newRequest = new Request(`${backendUrl}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    // Forward the request to your backend
    const response = await fetch(newRequest);

    // Create a new response with CORS headers enabled
    const corsResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...response.headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

    return corsResponse;
  },
};