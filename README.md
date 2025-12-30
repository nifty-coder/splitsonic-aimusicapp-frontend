# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/a2167204-31f1-4871-bd44-db41d8cd1fed

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/a2167204-31f1-4871-bd44-db41d8cd1fed) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Firebase Authentication

## Firebase Setup

This project uses Firebase Authentication for user management. To set up Firebase:

1. **Create a Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or select an existing one

2. **Enable Authentication**:
   - In your Firebase project, go to Authentication > Sign-in method
   - Enable Email/Password authentication
   - Enable Google authentication:
     * Click on "Google" provider
     * Toggle "Enable" switch
     * Enter a project support email (required)
     * Click "Save"
     * Note: Firebase will automatically create OAuth credentials for you

3. **Get Firebase Configuration**:
   - Go to Project Settings (gear icon)
   - Scroll down to "Your apps" section
   - Click "Add app" and select Web
   - Copy the configuration object

4. **Set Environment Variables**:
   - Create a `.env.local` file in the project root
   - Add your Firebase configuration and backend API URL:
   ```env
   VITE_FIREBASE_API_KEY=your_actual_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   
   # Backend API URL (for production, set this to your deployed backend URL)
   VITE_API_BASE_URL=http://localhost:8000
   ```

5. **Configure Authorized Domains (Required for Google Sign-In)**:
   - In Firebase Console, go to Authentication > Settings > Authorized domains
   - Click "Add domain" and add:
     * `localhost` (for local development)
     * Your production domain (e.g., `yourdomain.com`)
   - This is required to prevent "Access blocked" errors when using Google Sign-In

6. **Configure Google Cloud OAuth (If using Google Sign-In)**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your Firebase project (same project ID)
   - Navigate to APIs & Services > Credentials
   - Find your OAuth 2.0 Client ID (created automatically by Firebase)
   - Click to edit it
   - Under "Authorized JavaScript origins", add:
     * `http://localhost:8080` (for local development)
     * `https://yourdomain.com` (for production)
   - Under "Authorized redirect URIs", add:
     * `http://localhost:8080` (for local development)
     * `https://yourdomain.com` (for production)
   - Click "Save"

7. **Start the Development Server**:
   ```sh
   npm run dev
   ```

The app will now require authentication. Users will be redirected to the login page if not authenticated.

### Troubleshooting Google Sign-In

If you see "Access blocked: This app's request is invalid" error:

1. **Check Authorized Domains**:
   - Ensure `localhost` is added in Firebase Console > Authentication > Settings > Authorized domains
   - For production, ensure your domain is added

2. **Check OAuth Configuration**:
   - Verify Google Sign-In is enabled in Firebase Console > Authentication > Sign-in method
   - Check that your OAuth client ID has the correct authorized origins and redirect URIs in Google Cloud Console

3. **Check Environment Variables**:
   - Ensure all Firebase environment variables are set correctly in `.env.local`
   - Restart your dev server after changing environment variables

## Backend API Setup

This application requires a backend API server running on `http://localhost:8000` (or the URL specified in `VITE_API_BASE_URL`). The backend handles:

- User profile management (`/api/profile`)
- YouTube audio extraction (`/youtube`)
- Audio file uploads (`/upload`)

### Backend Requirements

The backend must be configured with Firebase Admin SDK to verify Firebase ID tokens from the frontend.

#### For Python/FastAPI Backend:

1. **Install Firebase Admin SDK**:
   ```bash
   pip install firebase-admin
   ```

2. **Get Firebase Service Account Key**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings (gear icon) > Service accounts
   - Click "Generate new private key"
   - Save the JSON file securely (e.g., `firebase-service-account.json`)

3. **Set Environment Variable** (in your backend server directory):
   
   **Option A: Using export command (temporary - only for current terminal session)**
   
   Open a terminal in your backend server directory and run:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/firebase-service-account.json"
   ```
   Replace `/path/to/firebase-service-account.json` with the actual path to your downloaded JSON file.
   
   **Option B: Using a `.env` file (recommended - persists across sessions)**
   
   In your backend server directory, create or edit a `.env` file and add:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-service-account.json
   ```
   
   Then make sure your backend code loads environment variables from the `.env` file (using `python-dotenv` for Python, or similar for other languages).
   
   **Example:**
   - If your backend is in `/Users/yourname/backend-server/`
   - And your service account file is at `/Users/yourname/backend-server/firebase-service-account.json`
   - Then use: `GOOGLE_APPLICATION_CREDENTIALS=/Users/yourname/backend-server/firebase-service-account.json`
   
   **Note:** This is done in your backend server directory, NOT in this frontend project directory.

4. **Initialize Firebase Admin in Your Backend**:
   ```python
   import firebase_admin
   from firebase_admin import credentials, auth
   
   # Initialize Firebase Admin
   cred = credentials.Certificate("firebase-service-account.json")
   firebase_admin.initialize_app(cred)
   
   # Verify ID token in your endpoints
   def verify_token(id_token: str):
       try:
           decoded_token = auth.verify_id_token(id_token)
           return decoded_token
       except Exception as e:
           raise HTTPException(status_code=401, detail=str(e))
   ```

5. **Example FastAPI Endpoint**:
   ```python
   from fastapi import FastAPI, HTTPException, Header
   
   app = FastAPI()
   
   @app.get("/api/profile")
   async def get_profile(authorization: str = Header(None)):
       if not authorization or not authorization.startswith("Bearer "):
           raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
       
       token = authorization.split("Bearer ")[1]
       try:
           decoded_token = auth.verify_id_token(token)
           user_id = decoded_token['uid']
           # Fetch profile from database using user_id
           # ...
       except Exception as e:
           raise HTTPException(status_code=401, detail=f"Firebase verification failed: {str(e)}")
   ```

### Backend API Endpoints

The backend should implement these endpoints:

- `GET /api/profile` - Get user profile (requires Firebase ID token)
- `POST /api/profile` - Create user profile (requires Firebase ID token)
- `PUT /api/profile` - Update user profile (requires Firebase ID token)
- `DELETE /api/profile` - Delete user profile (requires Firebase ID token)
- `POST /youtube` - Extract audio from YouTube URL (returns ZIP file)
- `POST /upload` - Upload and process audio file (returns ZIP file)

### Troubleshooting Backend Errors

**Error: "Firebase verification unavailable"**
- Ensure Firebase Admin SDK is installed
- Verify service account key file path is correct
- Check that `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set
- Ensure the service account has proper permissions in Firebase Console

**Error: "ffmpeg and ffprobe are required but not found" (500 error)**
- This means `ffmpeg` is not installed on the machine where your backend server is running
- **If running backend locally on macOS:**
  ```bash
  brew install ffmpeg
  ```
- **If running backend locally on Ubuntu/Debian:**
  ```bash
  sudo apt-get update
  sudo apt-get install ffmpeg
  ```
- **If running backend locally on Windows:**
  - Download from https://ffmpeg.org/download.html
  - Add ffmpeg to your system PATH
- **If backend is on a remote server:**
  - SSH into your server and install ffmpeg there
  - For Docker: Add `ffmpeg` installation to your Dockerfile
- After installing, restart your backend server

**Error: 500 Internal Server Error (general)**
- Check backend server logs for detailed error messages
- Verify all required dependencies are installed (including `ffmpeg` for audio processing)
- Ensure the backend server is running on the correct port (default: 8000)
- Verify that all system dependencies are available on the server

## Production Deployment

### Frontend Deployment (Firebase Hosting)

1. **Set Production Environment Variables**:
   
   Since Vite environment variables are embedded at build time, you need to set `VITE_API_BASE_URL` before building:
   
   ```bash
   # Set the production backend URL
   export VITE_API_BASE_URL=https://your-backend-api.com
   
   # Build the project
   npm run build
   
   # Deploy to Firebase
   firebase deploy --only hosting
   ```
   
   Or create a `.env.production` file:
   ```env
   VITE_API_BASE_URL=https://your-backend-api.com
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   ```
   
   Then build:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

2. **Important**: Make sure your backend server is deployed and accessible at the URL you set in `VITE_API_BASE_URL`.

### Backend CORS Configuration

Your backend server must allow CORS requests from your frontend domain. Here's an example for FastAPI:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aimusicapp-a2b65.web.app",  # Your Firebase Hosting URL
        "https://aimusicapp-a2b65.firebaseapp.com",  # Alternative Firebase URL
        "http://localhost:8080",  # For local development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

For other backend frameworks, ensure CORS is configured to allow:
- Your production frontend domain (`https://aimusicapp-a2b65.web.app`)
- Your Firebase app domain (`https://aimusicapp-a2b65.firebaseapp.com`)
- `Authorization` header (for Firebase ID tokens)
- `Content-Type` header

### Deploy via Lovable

Simply open [Lovable](https://lovable.dev/projects/a2167204-31f1-4871-bd44-db41d8cd1fed) and click on Share -> Publish.

**Note**: If deploying via Lovable, you may need to configure the `VITE_API_BASE_URL` in Lovable's environment settings or build configuration.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
