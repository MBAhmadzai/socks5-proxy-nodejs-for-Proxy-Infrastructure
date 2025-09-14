const net = require('net');
const dns = require('dns');

// SOCKS5 Protocol Constants
const SOCKS5_VERSION = 0x05;
const NO_AUTH = 0x00;
const USERNAME_PWD = 0x02;
const CONNECT = 0x01;
const IPv4 = 0x01;
const DOMAIN = 0x03;
const IPv6 = 0x04;
const SUCCESS = 0x00;
const FAILURE = 0x01;

class SOCKS5Proxy {
  constructor(config) {
    this.config = config;
  }

  start() {
    const server = net.createServer((clientSocket) => {
      this.handleConnection(clientSocket);
    });

    server.listen(this.config.port, () => {
      console.log(`SOCKS5 proxy server listening on port ${this.config.port}`);
      console.log(`Authentication: ${this.config.username}/${this.config.password}`);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
    });
  }

  handleConnection(clientSocket) {
    const clientAddr = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
    console.log(`New connection from ${clientAddr}`);

    let step = 'auth_negotiation';
    let buffer = Buffer.alloc(0);

    clientSocket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      
      try {
        switch (step) {
          case 'auth_negotiation':
            if (this.handleAuthNegotiation(clientSocket, buffer)) {
              step = 'authentication';
              buffer = Buffer.alloc(0);
            }
            break;
          
          case 'authentication':
            if (this.handleAuthentication(clientSocket, buffer)) {
              step = 'connection_request';
              buffer = Buffer.alloc(0);
            } else {
              clientSocket.end();
              return;
            }
            break;
          
          case 'connection_request':
            this.handleConnectionRequest(clientSocket, buffer, clientAddr);
            return; // Connection handling takes over
        }
      } catch (error) {
        console.error(`Error handling connection from ${clientAddr}:`, error);
        clientSocket.end();
      }
    });

    clientSocket.on('error', (err) => {
      console.error(`Client socket error from ${clientAddr}:`, err);
    });

    clientSocket.on('close', () => {
      console.log(`Connection closed: ${clientAddr}`);
    });
  }

  handleAuthNegotiation(clientSocket, buffer) {
    if (buffer.length < 2) return false;

    const version = buffer[0];
    const nMethods = buffer[1];

    if (version !== SOCKS5_VERSION) {
      clientSocket.end();
      return false;
    }

    if (buffer.length < 2 + nMethods) return false;

    // Check available authentication methods
    const methods = buffer.slice(2, 2 + nMethods);
    const supportsAuth = methods.includes(USERNAME_PWD);

    // Respond with selected method
    const response = Buffer.from([SOCKS5_VERSION, supportsAuth ? USERNAME_PWD : 0xFF]);
    clientSocket.write(response);

    return supportsAuth;
  }

  handleAuthentication(clientSocket, buffer) {
    if (buffer.length < 2) return false;

    const version = buffer[0];
    const usernameLen = buffer[1];

    if (version !== 0x01) return false;
    if (buffer.length < 2 + usernameLen + 1) return false;

    const username = buffer.slice(2, 2 + usernameLen).toString();
    const passwordLen = buffer[2 + usernameLen];

    if (buffer.length < 2 + usernameLen + 1 + passwordLen) return false;

    const password = buffer.slice(2 + usernameLen + 1, 2 + usernameLen + 1 + passwordLen).toString();

    // Verify credentials
    const success = username === this.config.username && password === this.config.password;

    // Send authentication response
    const response = Buffer.from([0x01, success ? SUCCESS : FAILURE]);
    clientSocket.write(response);

    if (!success) {
      console.log(`Authentication failed for user: ${username}`);
    }

    return success;
  }

  handleConnectionRequest(clientSocket, buffer, clientAddr) {
    if (buffer.length < 4) return;

    const version = buffer[0];
    const cmd = buffer[1];
    const reserved = buffer[2];
    const addrType = buffer[3];

    if (version !== SOCKS5_VERSION || cmd !== CONNECT) {
      this.sendConnectionResponse(clientSocket, FAILURE, '0.0.0.0', 0);
      clientSocket.end();
      return;
    }

    let targetHost;
    let headerLen = 4;

    // Parse target address
    switch (addrType) {
      case IPv4:
        if (buffer.length < headerLen + 4 + 2) return;
        targetHost = `${buffer[headerLen]}.${buffer[headerLen + 1]}.${buffer[headerLen + 2]}.${buffer[headerLen + 3]}`;
        headerLen += 4;
        break;

      case DOMAIN:
        if (buffer.length < headerLen + 1) return;
        const domainLen = buffer[headerLen];
        headerLen += 1;
        if (buffer.length < headerLen + domainLen + 2) return;
        targetHost = buffer.slice(headerLen, headerLen + domainLen).toString();
        headerLen += domainLen;
        break;

      case IPv6:
        if (buffer.length < headerLen + 16 + 2) return;
        const ipv6Parts = [];
        for (let i = 0; i < 16; i += 2) {
          ipv6Parts.push(buffer.readUInt16BE(headerLen + i).toString(16));
        }
        targetHost = ipv6Parts.join(':');
        headerLen += 16;
        break;

      default:
        this.sendConnectionResponse(clientSocket, FAILURE, '0.0.0.0', 0);
        clientSocket.end();
        return;
    }

    // Parse target port
    const targetPort = buffer.readUInt16BE(headerLen);
    const targetAddress = `${targetHost}:${targetPort}`;

    console.log(`Connection request: ${clientAddr} -> ${targetAddress}`);

    // Connect to target server
    const targetSocket = net.createConnection(targetPort, targetHost);

    targetSocket.on('connect', () => {
      // Send success response to client
      const localAddr = targetSocket.localAddress || '0.0.0.0';
      const localPort = targetSocket.localPort || 0;
      this.sendConnectionResponse(clientSocket, SUCCESS, localAddr, localPort);

      console.log(`Connection established: ${clientAddr} -> ${targetAddress}`);

      // Start relaying data
      this.relayData(clientSocket, targetSocket, clientAddr, targetAddress);
    });

    targetSocket.on('error', (err) => {
      console.error(`Failed to connect to ${targetAddress}:`, err.message);
      this.sendConnectionResponse(clientSocket, FAILURE, '0.0.0.0', 0);
      clientSocket.end();
    });
  }

  sendConnectionResponse(clientSocket, status, ip, port) {
    const ipBytes = ip.split('.').map(part => parseInt(part, 10));
    const portBytes = Buffer.allocUnsafe(2);
    portBytes.writeUInt16BE(port, 0);

    const response = Buffer.from([
      SOCKS5_VERSION,
      status,
      0x00, // Reserved
      IPv4, // Address type
      ...ipBytes,
      ...portBytes
    ]);

    clientSocket.write(response);
  }

  relayData(clientSocket, targetSocket, clientAddr, targetAddress) {
    // Client -> Target
    clientSocket.on('data', (data) => {
      if (targetSocket.writable) {
        targetSocket.write(data);
      }
    });

    // Target -> Client
    targetSocket.on('data', (data) => {
      if (clientSocket.writable) {
        clientSocket.write(data);
      }
    });

    // Handle connection closures
    clientSocket.on('close', () => {
      console.log(`Client disconnected: ${clientAddr} -> ${targetAddress}`);
      targetSocket.end();
    });

    clientSocket.on('error', (err) => {
      console.error(`Client socket error: ${clientAddr}:`, err.message);
      targetSocket.end();
    });

    targetSocket.on('close', () => {
      console.log(`Target disconnected: ${clientAddr} -> ${targetAddress}`);
      clientSocket.end();
    });

    targetSocket.on('error', (err) => {
      console.error(`Target socket error: ${targetAddress}:`, err.message);
      clientSocket.end();
    });
  }
}

// Configuration loading
function loadConfig() {
  return {
    port: process.env.PROXY_PORT || 1080,
    username: process.env.PROXY_USERNAME || 'admin',
    password: process.env.PROXY_PASSWORD || 'password'
  };
}

// Main execution
if (require.main === module) {
  const config = loadConfig();
  const proxy = new SOCKS5Proxy(config);
  proxy.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });
}

module.exports = SOCKS5Proxy;