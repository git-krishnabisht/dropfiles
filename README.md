# Dropfile: Secure Cloud Storage

A modern file storage application with chunked multipart uploads to AWS S3, real-time event processing via SQS, and comprehensive user authentication.

![Workflow Diagram](/backend/assets/api-workflow.png)

## Features

### Core Functionality
- **Chunked File Upload**: Upload files up to 1GB in 5MB chunks with parallel processing
- **Direct-to-S3 Uploads**: Files upload directly to S3 using presigned URLs for optimal performance
- **Real-time Processing**: S3 ObjectCreated events trigger SQS processing to update file status
- **File Management**: List, download, and delete files with a clean interface
- **Upload Control**: Cancel ongoing uploads with automatic cleanup

### Security & Authentication
- **JWT Authentication**: RS256 asymmetric encryption with HTTP-only cookies
- **Refresh Token Rotation**: Secure session management with device-specific tokens
- **"Remember Me" Option**: Configurable session duration (1 day or 15 days)
- **Password Security**: bcrypt hashing with 12 salt rounds
- **Protected Routes**: All file operations require authentication

### User Experience
- **Progress Tracking**: Real-time upload progress with percentage and chunk counts
- **File Search**: Filter files by name in the dashboard
- **Responsive Design**: Modern UI built with React and Tailwind CSS
- **Status Messages**: Clear feedback for all operations
- **Error Handling**: Automatic retries with exponential backoff

## Architecture

### Upload Flow
1. **Initialization**: Client requests presigned URLs for multipart upload
2. **Chunking**: File is split into 5MB chunks (configurable)
3. **Parallel Upload**: Up to 3 chunks upload simultaneously to S3
4. **Progress Tracking**: Each chunk completion is recorded in PostgreSQL
5. **Finalization**: After all chunks complete, multipart upload is finalized
6. **Event Processing**: S3 triggers ObjectCreated event to SQS
7. **Status Update**: Background worker polls SQS and updates file status to UPLOADED

### Technology Stack

**Backend**
- Node.js with Express.js
- TypeScript for type safety
- Prisma ORM with PostgreSQL for metadata storage
- AWS SDK v3 (S3 for storage, SQS for event processing)
- Redis for upload session management
- JWT with RS256 for authentication
- Winston for structured logging

**Frontend**
- React 19 with TypeScript
- React Router for navigation
- Tailwind CSS for styling
- Vite for fast development builds
- Context API for state management
- Custom hooks for upload logic

**Infrastructure**
- AWS S3 for object storage
- AWS SQS for asynchronous event processing
- PostgreSQL for user and file metadata
- Redis for caching and session management
- Docker & Docker Compose for containerization

## Database Schema

```sql
-- User authentication and profile
User {
  id            UUID PRIMARY KEY
  email         TEXT UNIQUE NOT NULL
  name          TEXT
  passwordHash  TEXT NOT NULL
  createdAt     TIMESTAMP DEFAULT NOW()
}

-- Refresh token sessions
Session {
  id                UUID PRIMARY KEY
  userId            UUID FOREIGN KEY -> User.id
  refreshTokenHash  TEXT NOT NULL
  deviceId          TEXT UNIQUE NOT NULL
  createdAt         TIMESTAMP DEFAULT NOW()
  expiresAt         TIMESTAMP NOT NULL
}

-- File metadata and status
FileMetadata {
  fileId     UUID PRIMARY KEY
  fileName   TEXT NOT NULL
  mimeType   TEXT NOT NULL
  size       INTEGER
  s3Key      TEXT UNIQUE NOT NULL
  status     ENUM(UPLOADING, UPLOADED, FAILED) DEFAULT UPLOADING
  userId     UUID FOREIGN KEY -> User.id
  createdAt  TIMESTAMP DEFAULT NOW()
}

-- Individual chunk tracking
Chunk {
  id          UUID PRIMARY KEY
  fileId      UUID FOREIGN KEY -> FileMetadata.fileId ON DELETE CASCADE
  chunkIndex  INTEGER NOT NULL
  size        INTEGER NOT NULL
  s3Key       TEXT NOT NULL
  checksum    TEXT (ETag from S3)
  status      ENUM(PENDING, COMPLETED, FAILED) DEFAULT PENDING
  createdAt   TIMESTAMP DEFAULT NOW()
  
  UNIQUE(fileId, chunkIndex)
}
```

## Setup

### Prerequisites
- Node.js >= 18
- PostgreSQL database
- Redis instance
- AWS account with:
  - S3 bucket configured
  - SQS queue set up
  - IAM user with appropriate permissions

### Environment Configuration

Create `backend/.env`:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
SQS_QUEUE_URL=https://sqs.region.amazonaws.com/account-id/queue-name

# Database
CLOUD_DB_URI=postgresql://user:password@host:port/database

# Redis
CLOUD_RD_URI=redis://host:port

# JWT Keys (RS256 - generate using openssl)
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----

# Optional: OAuth (for future Google Sign-In)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Server Configuration
NODE_ENV=development
LOG_LEVEL=info
```

Create `frontend/.env`:

```env
VITE_BASE_URL=http://localhost:50136/api
```

### Generate JWT Keys

```bash
# Generate private key
openssl genrsa -out private.key 2048

# Generate public key
openssl rsa -in private.key -pubout -out public.key

# For .env file, replace newlines with \n
cat private.key | awk '{printf "%s\\n", $0}' > private_key.txt
cat public.key | awk '{printf "%s\\n", $0}' > public_key.txt
```

### Installation

```bash
# Install backend dependencies
cd backend
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start backend server
npm run dev

# In a new terminal, install frontend dependencies
cd frontend
npm install

# Start frontend development server
npm run dev
```

### Docker Deployment

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

## API Endpoints

### Authentication
| Endpoint | Method | Description | Body |
|----------|--------|-------------|------|
| `/api/auth/signup` | POST | User registration | `{ user: { email, name, password } }` |
| `/api/auth/signin` | POST | User login | `{ user: { email, password }, rememberMe: boolean }` |
| `/api/auth/signout` | GET | User logout | - |
| `/api/auth/refresh` | GET | Refresh access token | - |
| `/api/auth/authenticate` | GET | Verify authentication | - |

### File Operations
| Endpoint | Method | Description | Body |
|----------|--------|-------------|------|
| `/api/files/get-upload-urls` | POST | Initialize multipart upload | `{ file_id, file_name, file_type, file_size }` |
| `/api/files/record-chunk` | POST | Record chunk completion | `{ file_id, chunk_index, etag }` |
| `/api/files/complete-upload` | POST | Finalize multipart upload | `{ uploadId, parts: [{ ETag, PartNumber }], fileId }` |
| `/api/files/abort-upload` | POST | Cancel upload | `{ uploadId, file_id }` |
| `/api/files/get-download-url` | POST | Generate presigned download URL | `{ s3_key }` |
| `/api/files/list` | GET | List user's files | - |
| `/api/files/delete` | DELETE | Delete file | `{ file_id }` |

### Health Check
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health status |

## Configuration

### Upload Settings
```typescript
const CHUNK_SIZE = 5 * 1024 * 1024;      // 5MB per chunk
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB max file size
const MAX_PARALLEL_UPLOADS = 3;          // 3 concurrent chunk uploads
const PRESIGNED_URL_EXPIRY = 3600;       // 1 hour
```

### Authentication Settings
```typescript
const AT_TTL = 7 * 24 * 60 * 60 * 1000;      // Access token: 7 days (dev)
const RT_TTL = 15 * 24 * 60 * 60 * 1000;     // Refresh token: 15 days
const DEVICE_ID_TTL = 30 * 24 * 60 * 60 * 1000; // Device ID: 30 days
const ONE_DAY_TTL = 1 * 24 * 60 * 60 * 1000;    // Short session: 1 day
```

### Redis & SQS
```typescript
const REDIS_TTL = 24 * 60 * 60;         // Upload session: 24 hours
const SQS_POLLING_INTERVAL = 20;        // Poll every 20 seconds
const SQS_MAX_MESSAGES = 5;             // Process up to 5 messages per poll
```

## Development

```bash
# Backend development
cd backend
npm run dev      # Start with hot reload (tsx --watch)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled JavaScript

# Frontend development
cd frontend
npm run dev      # Start Vite dev server (port 5173)
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Project Structure

```
dropfile/
├── backend/
│   ├── src/
│   │   ├── domains/
│   │   │   ├── auth/           # Authentication logic
│   │   │   └── files/          # File operations
│   │   ├── shared/
│   │   │   ├── config/         # Configuration files
│   │   │   ├── middleware/     # Express middleware
│   │   │   ├── services/       # AWS services, JWT
│   │   │   └── utils/          # Helper utilities
│   │   ├── workers/            # SQS polling worker
│   │   ├── types/              # TypeScript types
│   │   └── server.ts           # Express server entry
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── migrations/         # Migration files
│   ├── logs/                   # JSON log files
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── contexts/           # Context providers
│   │   ├── hooks/              # Custom hooks
│   │   ├── pages/              # Page components
│   │   ├── services/           # API services
│   │   ├── types/              # TypeScript types
│   │   ├── utils/              # Helper utilities
│   │   ├── App.tsx             # Main app component
│   │   └── main.tsx            # Entry point
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── docker-compose.yml
```

## Security Best Practices

### Implemented
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens use RS256 asymmetric encryption
- HTTP-only cookies with secure flag in production
- CORS configured for specific origins
- Time-limited presigned URLs for S3 operations
- Parameterized database queries via Prisma
- Input validation on all endpoints
- Refresh token rotation with device tracking
- Session expiration and cleanup

### Recommendations
- Enable HTTPS in production (use reverse proxy like nginx)
- Implement rate limiting on authentication endpoints
- Add CSRF protection for state-changing operations
- Set up AWS WAF for additional protection
- Enable S3 bucket encryption at rest
- Implement file scanning for malware
- Add request ID tracking for security auditing

## Logging

The application uses Winston for structured JSON logging with automatic rotation:

```
backend/logs/
├── combined.log.json    # All logs
├── info.log.json        # Info level and above
├── warn.log.json        # Warnings
├── error.log.json       # Errors only
├── exceptions.log.json  # Uncaught exceptions
└── rejections.log.json  # Unhandled promise rejections
```

**Log Rotation**: Files rotate when they reach 10MB, keeping 5 backups.

## Error Handling

### Retry Logic
- **S3 Upload Failures**: Automatic retry with exponential backoff (3 attempts)
- **API Request Failures**: Exponential backoff for transient errors
- **SQS Polling**: Continues on error with 5-second delay

### User-Facing Errors
- Validation errors return 400 with specific field information
- Authentication failures return 401 with clear messages
- Upload failures provide detailed error context
- Server errors return 500 with generic message (details logged)

## Known Limitations

1. **Single File Upload**: No concurrent multi-file uploads (by design for simplicity)
2. **Maximum File Size**: 1GB limit enforced at application level
3. **Fixed Chunk Size**: 5MB chunks cannot be configured at runtime
4. **No Resume**: Upload sessions lost on page refresh (Redis TTL: 24h)
5. **Manual Cleanup**: Failed uploads require manual S3/database cleanup
6. **No File Preview**: No built-in preview for images/videos
7. **No Sharing**: Files are private to the uploading user
8. **No Folders**: Flat file structure only

## Future Enhancements

- [ ] Multi-file upload support
- [ ] Resumable uploads with IndexedDB
- [ ] File preview and thumbnail generation
- [ ] Folder organization and hierarchical structure
- [ ] File sharing with expiring links
- [ ] User storage quotas and usage tracking
- [ ] File versioning
- [ ] Server-side file scanning
- [ ] Progress persistence across sessions
- [ ] OAuth integration (Google, GitHub)
- [ ] WebSocket for real-time status updates
- [ ] Mobile application
- [ ] Admin dashboard

## Troubleshooting

### Upload Fails Immediately
- Check S3 bucket CORS configuration
- Verify AWS credentials and permissions
- Ensure presigned URLs are not expired

### Files Stuck in "UPLOADING" Status
- Check SQS queue for messages
- Verify S3 event notifications are configured
- Review backend logs for SQS polling errors
- Ensure Redis is accessible

### Authentication Issues
- Verify JWT keys are properly formatted in .env
- Check cookie settings (httpOnly, secure, sameSite)
- Ensure frontend and backend URLs match CORS config
- Clear browser cookies and try again

### Database Connection Errors
- Verify PostgreSQL connection string
- Run `npx prisma migrate deploy` to apply migrations
- Check database user permissions
 
## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

---

**Built with Love using TypeScript, React, Node.js, AWS and "Claude"**