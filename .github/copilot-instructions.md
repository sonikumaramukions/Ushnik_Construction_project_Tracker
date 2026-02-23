# Construction Tracker System

This is a full-stack web application for construction project management with role-based access control and dynamic Excel-like tracking sheets.

## Project Structure
- Backend: Node.js with Express
- Frontend: React with TypeScript
- Database: PostgreSQL
- Authentication: JWT tokens
- Real-time updates: Socket.io

## User Roles
- L1 Admin (System Controller)
- L2 Senior Engineer/Manager  
- L3 Junior Engineer
- Project Manager
- Ground Manager (Site Supervisor)
- CEO (View-only)

## Key Features
- Dynamic spreadsheet creation and management
- Cell-level permissions and validation
- Real-time data synchronization
- Mobile-responsive design for field workers
- Audit logging and approval workflows

## Development Guidelines
- Follow role-based access control patterns
- Implement proper data validation
- Ensure mobile-first design for Ground Manager role
- Use TypeScript for type safety
- Follow REST API conventions