# Security

This is a local read-only debugger. No wallets or private keys are needed. Live signatures are sent to a fixed public RPC endpoint. No lookup data is written to disk automatically.

Do not bind it publicly or use it as a hosted RPC proxy. Local processes with access to your machine can call a loopback service. Host and Origin checks reduce cross-site access; they are not user authentication.

Keep Node.js and dependencies current. Avoid sharing exports containing information you did not intend to disclose, even though the transaction record is public.

For a security issue, use the repository's private vulnerability reporting feature when available. Do not include secrets in public issues. Maintainer contact: royalpinto007@gmail.com.
