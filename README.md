# Construction Tracker System

A comprehensive construction project management system with role-based access control and dynamic Excel-like tracking sheets.

## 🏗️ Project Overview

The Construction Tracker System is designed for real construction companies to manage project progress using dynamic, Excel-like sheets that can be created by administrators and filled by site teams. The system provides role-based access with strict permissions and audit logging.

## 👥 User Roles

- **L1 Admin**: System Controller - Creates and manages tracking sheets
- **L2 Senior Engineer/Manager**: Reviews and validates technical data
- **L3 Junior Engineer**: Enters basic measurement data
- **Project Manager**: Coordinates between teams and monitors progress
- **Ground Manager**: Site supervisor with mobile-first interface
- **CEO**: Executive view with high-level dashboards

## 🚀 Tech Stack

### Backend
- Node.js with Express
- PostgreSQL with Sequelize ORM
- JWT Authentication
- Socket.io for real-time updates
- Winston for logging

### Frontend
- React with TypeScript
- Material-UI for components
- React Router for navigation
- Axios for API calls
- Socket.io client for real-time updates

## 📁 Project Structure

```
construction-tracker/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── utils/
│   │   └── types/
│   └── package.json
└── README.md
```

## ⚡ Getting Started

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd construction-tracker
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

4. Set up environment variables:
```bash
# In backend directory, create .env file
cp .env.example .env
# Configure your database connection and JWT secret
```

5. Set up the database:
```bash
cd backend
npm run seed
```

### Running the Application

1. Start the backend server:
```bash
cd backend
npm run dev
```

2. Start the frontend development server:
```bash
cd frontend
npm start
```

3. Access the application at `http://localhost:3000`

## 🔐 Default Login Credentials

- **L1 Admin**: admin@construction.com / admin123
- **L2 Senior Engineer**: senior@construction.com / senior123
- **L3 Junior Engineer**: junior@construction.com / junior123
- **Project Manager**: pm@construction.com / pm123
- **Ground Manager**: ground@construction.com / ground123
- **CEO**: ceo@construction.com / ceo123

## 🎯 Key Features

### Dynamic Sheet Creation
- Excel-like interface for creating tracking sheets
- Cell-level permission management
- Custom validation rules
- Real-time collaboration

### Role-Based Access Control
- Strict role-based permissions
- Audit logging for all actions
- Secure JWT authentication
- Session management

### Mobile-First Design
- Responsive design for all devices
- Optimized mobile interface for Ground Manager
- Offline data entry capability
- Touch-friendly controls

### Real-Time Updates
- Live data synchronization
- Instant notifications
- Progress tracking
- Team collaboration

## 🛠️ Development

### API Endpoints
- `/api/auth` - Authentication routes
- `/api/users` - User management
- `/api/projects` - Project operations
- `/api/sheets` - Dynamic sheet management
- `/api/data` - Data entry and retrieval

### Database Schema
- Users and roles management
- Project and sheet structures
- Cell-level permissions
- Audit logging

## 📱 Mobile Support

The application is fully responsive with special consideration for mobile users, particularly Ground Managers who need field access:

- Touch-optimized interface
- Large tap targets
- Simplified navigation
- Offline capabilities
- Camera integration for photo uploads

## 🔧 Configuration

### Environment Variables
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=construction_tracker
DB_USER=your_username
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d

# Server
PORT=5000
NODE_ENV=development
```

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 📚 Documentation

- [API Documentation](docs/api.md)
- [User Guide](docs/user-guide.md)
- [Development Guide](docs/development.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🆘 Support

For support and questions, please contact the development team or create an issue in the repository.