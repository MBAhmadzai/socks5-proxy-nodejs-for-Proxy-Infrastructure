# SOCKS5 Proxy Server (Node.js)

A simple SOCKS5 proxy server implementation in Node.js that supports username/password authentication and TCP traffic tunneling.

## Features

- ✅ SOCKS5 protocol support
- ✅ Username/password authentication
- ✅ TCP traffic forwarding
- ✅ Connection logging (source IP, destination host/port)
- ✅ Configurable listening port
- ✅ Environment variable configuration
- ✅ Graceful shutdown handling

## Prerequisites

- Node.js 14.0.0 or higher

## Quick Start

1. **Clone the repository:**
```bash
git clone <your-repo-url>
cd socks5-proxy-server
```

2. **Install dependencies (none required - uses only Node.js standard library):**
```bash
npm install
```

3. **Run with default settings:**
```bash
npm start
# or
node server.js
```

The proxy will start on port 1080 with default credentials:
- Username: `admin`
- Password: `password`

4. **Run with custom configuration:**
```bash
PROXY_PORT=8080 PROXY_USERNAME=myuser PROXY_PASSWORD=mypass npm start
```

## Configuration

The proxy can be configured using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_PORT` | `1080` | Port to listen on |
| `PROXY_USERNAME` | `admin` | Username for authentication |
| `PROXY_PASSWORD` | `password` | Password for authentication |

## Testing

### Test 1: Basic connectivity with curl
```bash
# Test HTTP request through the proxy
curl --socks5-hostname admin:password@localhost:1080 http://httpbin.org/ip

# Test HTTPS request
curl --socks5-hostname admin:password@localhost:1080 https://ipinfo.io

# Test with different port (if configured)
curl --socks5-hostname myuser:mypass@localhost:8080 https://ipinfo.io
```

### Test 2: Using other tools
```bash
# With wget
wget --proxy-user=admin --proxy-password=password \
     --proxy=on --socks-proxy=localhost:1080 \
     -O - http://httpbin.org/ip

# Test connectivity
nc -v -x localhost:1080 -X 5 google.com 80
```

### Test 3: Browser configuration
Configure your browser to use SOCKS5 proxy:
- Proxy: `localhost`
- Port: `1080` 
- Username: `admin`
- Password: `password`

## Example Output

When running the proxy, you'll see logs like this:
```
SOCKS5 proxy server listening on port 1080
Authentication: admin/password
New connection from ::ffff:127.0.0.1:54321
Connection request: ::ffff:127.0.0.1:54321 -> httpbin.org:80
Connection established: ::ffff:127.0.0.1:54321 -> httpbin.org:80
```

## Development

### Project Structure
```
socks5-proxy-server/
├── server.js          # Main SOCKS5 server implementation
├── package.json       # Node.js project configuration
├── README.md          # Documentation
└── REFLECTION.md      # Learning reflection
```

### Running in Development Mode
```bash
npm run dev
```

### Creating a Test Script
Create `test.js` for automated testing:
```javascript
const SOCKS5Proxy = require('./server');
// Add your test cases here
```

## Protocol Implementation

This implementation supports:

- **Authentication Methods**: Username/Password (0x02)
- **Commands**: CONNECT (0x01)
- **Address Types**: IPv4 (0x01), Domain (0x03), IPv6 (0x04)

## Error Handling

The server includes robust error handling for:
- Invalid protocol versions
- Unsupported authentication methods
- Connection failures to target servers
- Network timeouts and interruptions
- Graceful shutdown on SIGINT/SIGTERM

## Troubleshooting

### Common Issues

1. **Connection refused**
   - Check if the proxy is running: `netstat -tlnp | grep 1080`
   - Verify firewall settings
   - Try a different port if 1080 is in use

2. **Authentication failed**
   - Ensure correct username/password in curl command
   - Check environment variables: `echo $PROXY_USERNAME`

3. **Target unreachable**
   - Verify target server is accessible: `curl http://target-server`
   - Check DNS resolution: `nslookup target-server`

4. **High memory usage**
   - The server handles concurrent connections efficiently
   - For production, consider adding connection limits

### Debug Mode
Add debugging by modifying the console.log statements or setting `NODE_DEBUG=net`:
```bash
NODE_DEBUG=net node server.js
```

## Performance Considerations

- **Concurrent Connections**: Node.js handles multiple connections efficiently using its event loop
- **Memory Usage**: Each connection uses minimal memory overhead
- **CPU Usage**: Optimized for I/O intensive proxy operations

## Limitations

- Only supports TCP connections (no UDP)
- No built-in rate limiting (add middleware if needed)
- Basic authentication logging (extend for audit requirements)
- IPv6 support is basic (full implementation would need more testing)

## Security Considerations

- Change default credentials in production
- Consider adding IP whitelisting
- Implement connection limits per client
- Add proper audit logging
- Use environment variables for sensitive configuration
- Consider TLS termination for credential protection

## Deployment

### Using PM2 (Production Process Manager)
```bash
npm install -g pm2
pm2 start server.js --name socks5-proxy
pm2 save
pm2 startup
```

### Docker Deployment
Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY server.js ./
EXPOSE 1080
CMD ["npm", "start"]
```

### Environment Variables for Production
```bash
export PROXY_PORT=1080
export PROXY_USERNAME=secure_username  
export PROXY_PASSWORD=secure_password_123
```
