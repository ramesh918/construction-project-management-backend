# Step 10 — CDK Stack: Cognito

---

## What You Are Doing

Add Cognito (authentication) to `lib/buildtrack-stack.ts`.
This creates a User Pool with two groups: **admin** and **user**.

> ⚠️ Do NOT replace the whole file — add the Cognito code inside the constructor, after the S3 section.

---

## 10.1 Add Cognito Import

At the top of `lib/buildtrack-stack.ts`, add alongside existing imports:

```typescript
// Import Cognito module from AWS CDK library
// Cognito = Authentication & User Management service
// Allows you to use: cognito.UserPool(), cognito.UserPoolClient(), etc.
import * as cognito from 'aws-cdk-lib/aws-cognito';
```

Your imports section should now look like:

```typescript
// Core AWS CDK library - required for all AWS resources
import * as cdk from 'aws-cdk-lib';

// DynamoDB module - for creating database tables
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

// S3 module - for creating storage buckets
import * as s3 from 'aws-cdk-lib/aws-s3';

// Cognito module - for user authentication & authorization (NEW)
import * as cognito from 'aws-cdk-lib/aws-cognito';

// Construct base class - all CDK resources inherit from Construct
import { Construct } from 'constructs';
```

---

## 10.2 Add Cognito Code

Inside the constructor, **after** the S3 `CfnOutput` block, add:

```typescript
// ────────────────────────────────────────────────
// Cognito User Pool — authentication
// Admin creates users (no self sign-up)
// Two groups: admin, user
// ────────────────────────────────────────────────

// CREATE USER POOL
const userPool = new cognito.UserPool(this, 'BuildTrackUserPool', {
  // Display name shown in AWS Console
  userPoolName: 'buildtrack-users',
  
  // SIGNUP SETTINGS
  // false = Users CANNOT self-register (only admin creates accounts)
  // true = Users CAN create their own accounts
  selfSignUpEnabled: false,
  
  // SIGNIN METHOD
  // { email: true } = Users sign in using email (not username)
  // Could also use: { username: true } or { phoneNumber: true }
  signInAliases: { email: true },
  
  // USER PROFILE ATTRIBUTES
  standardAttributes: {
    // email: Required field that users can modify
    // - required: true = Must be provided when creating account
    // - mutable: true = User can update their email later
    email: { required: true, mutable: true },
    
    // fullname: Optional field that users can modify
    // - required: false = Not mandatory during signup
    // - mutable: true = User can update their name
    fullname: { required: false, mutable: true },
  },
  
  // PASSWORD COMPLEXITY REQUIREMENTS
  passwordPolicy: {
    // Minimum 8 characters (password must be at least 8 chars long)
    minLength: 8,
    
    // true = Must contain lowercase letters (a-z)
    requireLowercase: true,
    
    // true = Must contain uppercase letters (A-Z)
    requireUppercase: true,
    
    // true = Must contain numbers (0-9)
    requireDigits: true,
    
    // false = Special characters NOT required (e.g., !@#$%^&*)
    // true = Would require at least one special character
    requireSymbols: false,
  },
  
  // ACCOUNT RECOVERY METHOD
  // EMAIL_ONLY = User can reset password via email link
  // Other options: SMS_ONLY, EMAIL_AND_SMS, PRIORITY_EMAIL_ONLY, PRIORITY_SMS_ONLY
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  
  // DELETION POLICY
  // RETAIN = When cdk destroy runs, User Pool is NOT deleted (protects user data)
  // DESTROY = Pool would be deleted (not recommended for production)
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// ────────────────────────────────────────────────
// CREATE APP CLIENT
// This allows your frontend app to authenticate with the User Pool
// ────────────────────────────────────────────────

const userPoolClient = new cognito.UserPoolClient(this, 'BuildTrackClient', {
  // Link this client to the User Pool created above
  userPool,
  
  // Display name for this client in AWS Console
  userPoolClientName: 'buildtrack-app-client',
  
  // AUTHENTICATION METHODS ENABLED
  authFlows: {
    // USER_PASSWORD_AUTH
    // - User sends email + password directly to sign in
    // - Simpler but less secure (credentials sent to backend)
    // - Good for: Web apps, simple login flows
    userPassword: true,
    
    // USER_SRP_AUTH (Secure Remote Password)
    // - More secure protocol, password never sent in plaintext
    // - Better for: Mobile apps, web apps
    // - Recommended for production
    userSrp: true,
    
    // ADMIN_USER_PASSWORD_AUTH
    // - Backend can sign in user with their password
    // - Used for: Server-to-server authentication
    // - Must be called from backend only (not frontend)
    adminUserPassword: true,
  },
  
  // ACCESS TOKEN EXPIRY
  // Duration.hours(1) = Access token valid for 1 hour
  // After 1 hour, token expires and user must refresh
  // Lower value = More secure but more refresh calls
  // Higher value = Less frequent refresh but less secure
  accessTokenValidity: cdk.Duration.hours(1),
  
  // ID TOKEN EXPIRY
  // Duration.hours(1) = ID token (contains user info) valid for 1 hour
  // Usually same as accessTokenValidity
  idTokenValidity: cdk.Duration.hours(1),
  
  // REFRESH TOKEN EXPIRY
  // Duration.days(30) = Refresh token valid for 30 days
  // After 30 days, user must log in again
  // Refresh tokens don't expire on use (unlike access tokens)
  refreshTokenValidity: cdk.Duration.days(30),
  
  // CLIENT SECRET
  // false = No client secret generated (for browser/mobile apps)
  //   - Public clients can't securely store secrets
  //   - Browser apps (React, Vue) should use false
  // true = Client secret generated (for backend apps)
  //   - Backend can securely store secrets
  //   - Use for Node.js, Python backends
  generateSecret: false,
});

// ────────────────────────────────────────────────
// CREATE USER GROUPS
// Groups control what users can do (authorization)
// ────────────────────────────────────────────────

// ADMIN GROUP - Full access
new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
  // Which User Pool this group belongs to
  userPoolId: userPool.userPoolId,
  
  // Group name (used in code to check permissions)
  // if (user.groups.includes('admin')) { ... }
  groupName: 'admin',
  
  // Readable description of what this group can do
  description: 'Full access — manage all resources',
  
  // Priority level: 1 = HIGHEST priority
  // If user in multiple groups, LOWEST number wins
  // Ensures admins always get admin permissions
  precedence: 1,
});

// USER GROUP - Limited access
new cognito.CfnUserPoolGroup(this, 'UserGroup', {
  // Which User Pool this group belongs to
  userPoolId: userPool.userPoolId,
  
  // Group name (used in code to check permissions)
  // if (user.groups.includes('user')) { ... }
  groupName: 'user',
  
  // Readable description (field-level access only)
  description: 'Field access — update progress and attendance only',
  
  // Priority level: 2 = LOWER priority than admin
  // Regular users have standard permissions
  precedence: 2,
});

// ────────────────────────────────────────────────
// OUTPUTS
// Display important IDs needed for frontend configuration
// ────────────────────────────────────────────────

// User Pool ID Output
new cdk.CfnOutput(this, 'UserPoolId', {
  // The actual User Pool ID value (AWS generated)
  value: userPool.userPoolId,
  
  // Description shown in CloudFormation outputs
  description: 'Cognito User Pool ID',
  // Visible in: AWS Console, cdk deploy output, CloudFormation stack
  // Use this to: Configure AWS Amplify, create custom integrations
});

// App Client ID Output
new cdk.CfnOutput(this, 'UserPoolClientId', {
  // The actual App Client ID (needed by frontend)
  value: userPoolClient.userPoolClientId,
  
  // Description shown in CloudFormation outputs
  description: 'Cognito App Client ID',
  // Visible in: AWS Console, cdk deploy output
  // Use this: In React/Vue frontend environment variables
  // Example: REACT_APP_COGNITO_CLIENT_ID=<this-value>
});
```

---

## 10.3 Verify It Compiles

```bash
cdk synth
```

Expected: CloudFormation template includes DynamoDB, S3, and Cognito with no errors.
Outputs section should now show: `TableName`, `BucketName`, `UserPoolId`, `UserPoolClientId`.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---------|--------------|
| `selfSignUpEnabled: false` | Users cannot register themselves — admin creates all accounts |
| `signInAliases: { email: true }` | Users log in with their email address |
| `authFlows` | Enables email+password login for the app |
| `accessTokenValidity: 1hr` | JWT token expires in 1 hour — user must refresh |
| `refreshTokenValidity: 30d` | Refresh token lasts 30 days — user stays logged in |
| `admin` group (precedence 1) | Full access to all API routes |
| `user` group (precedence 2) | Field-level access only (attendance, progress) |
| RETAIN | User pool is NOT deleted if you run `cdk destroy` |

---

## Checkpoints Before Moving to Step 11

- [ ] Cognito import added at the top of `lib/buildtrack-stack.ts`
- [ ] Cognito User Pool, Client, and Groups added inside the constructor
- [ ] `cdk synth` runs with no errors
- [ ] Output includes `UserPoolId` and `UserPoolClientId`

---

## Line-by-Line Code Explanation

### **Import Statement (Line 19)**
```typescript
import * as cognito from 'aws-cdk-lib/aws-cognito';
```
- **Imports**: Brings in the Cognito module from AWS CDK library
- **`* as cognito`**: Imports all Cognito classes and aliases them as `cognito` namespace
- **Purpose**: Allows you to use `cognito.UserPool()`, `cognito.UserPoolClient()`, etc.

---

### **User Pool Creation Block (Lines 44-61)**

**Line 44:**
```typescript
const userPool = new cognito.UserPool(this, 'BuildTrackUserPool', {
```
- **`new cognito.UserPool()`**: Creates a new AWS Cognito User Pool resource
- **`this`**: Adds it to the current CDK Stack
- **`'BuildTrackUserPool'`**: Logical ID (unique identifier within the stack)
- **`{`**: Starts configuration object for the User Pool

**Line 45:**
```typescript
  userPoolName: 'buildtrack-users',
```
- **Sets the display name** in AWS Management Console
- **User-friendly identifier** for the User Pool
- Can be different from the logical ID

**Line 46:**
```typescript
  selfSignUpEnabled: false,
```
- **Disables self-registration**: Users cannot create their own accounts
- **Only admins** can create user accounts
- **Security benefit**: Control who gets access to your system

**Line 47:**
```typescript
  signInAliases: { email: true },
```
- **Allows email-based login**: Users sign in using their email address instead of username
- **`email: true`**: Email is enabled as a sign-in alias
- **Alternatives**: Could also enable `username`, `phone_number`, `preferred_username`

**Lines 48-51:**
```typescript
  standardAttributes: {
    email:    { required: true,  mutable: true },
    fullname: { required: false, mutable: true },
  },
```
- **Defines user profile attributes**
- **`email`**: Required field, must be provided when creating account
  - **`mutable: true`**: User can change their email later
- **`fullname`**: Optional field
  - **`required: false`**: Not mandatory during account creation
  - **`mutable: true`**: User can update their full name
- **Standard attributes**: Predefined by Cognito (vs. custom attributes)

**Lines 52-58:**
```typescript
  passwordPolicy: {
    minLength:        8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits:    true,
    requireSymbols:   false,
  },
```
- **Sets password complexity requirements**
- **`minLength: 8`**: Minimum 8 characters required
- **`requireLowercase: true`**: Must contain lowercase letters (a-z)
- **`requireUppercase: true`**: Must contain uppercase letters (A-Z)
- **`requireDigits: true`**: Must contain numbers (0-9)
- **`requireSymbols: false`**: Special characters NOT required (optional)
- **Example valid password**: `Password123`

**Line 59:**
```typescript
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
```
- **Sets account recovery method**
- **`EMAIL_ONLY`**: Users can reset password using email verification link
- **Other options**: `SMS_ONLY`, `EMAIL_AND_SMS`, `PRIORITY_EMAIL_ONLY`, `PRIORITY_SMS_ONLY`
- **Security**: Email must be verified before reset happens

**Line 60:**
```typescript
  removalPolicy: cdk.RemovalPolicy.RETAIN,
```
- **`RETAIN`**: When you run `cdk destroy`, this User Pool will NOT be deleted
- **Protects important data** from accidental deletion
- **Alternative**: `DESTROY` would delete it (not recommended for production)
- **Safety measure**: Prevents loss of user accounts and authentication data

---

### **User Pool Client Creation Block (Lines 63-75)**

**Line 63:**
```typescript
const userPoolClient = new cognito.UserPoolClient(this, 'BuildTrackClient', {
```
- **`new cognito.UserPoolClient()`**: Creates an application client
- **Client**: The bridge between your frontend app and the User Pool
- **`'BuildTrackClient'`**: Logical ID for this specific client
- **Purpose**: Frontend app uses this client to authenticate users

**Line 64:**
```typescript
  userPool,
```
- **Links this client** to the User Pool created earlier
- **Establishes relationship**: This client will authenticate against that User Pool
- **Shorthand syntax**: Equivalent to `userPool: userPool`

**Line 65:**
```typescript
  userPoolClientName: 'buildtrack-app-client',
```
- **Display name** shown in AWS Console
- **Identifies the client** purpose in the dashboard

**Lines 66-70:**
```typescript
  authFlows: {
    userPassword:    true,
    userSrp:         true,
    adminUserPassword: true,
  },
```
- **Specifies which authentication methods are allowed**
- **`userPassword: true`**: USER_PASSWORD_AUTH
  - User sends email + password directly to sign in
  - Simpler but less secure (password sent to backend)
- **`userSrp: true`**: USER_SRP_AUTH (Secure Remote Password)
  - More secure protocol used in mobile/web apps
  - Password never sent in plaintext over network
  - Recommended for public clients
- **`adminUserPassword: true`**: ADMIN_USER_PASSWORD_AUTH
  - Allows backend to sign in user with their password
  - Used for server-to-server authentication

**Line 71:**
```typescript
  accessTokenValidity: cdk.Duration.hours(1),
```
- **Access token expires in 1 hour**
- **Access token**: JWT token used to call APIs and access resources
- **`Duration.hours(1)`**: After 1 hour, token becomes invalid
- **User experience**: User must refresh token or log in again

**Line 72:**
```typescript
  idTokenValidity: cdk.Duration.hours(1),
```
- **ID token expires in 1 hour**
- **ID token**: Contains user identity information (email, name, etc.)
- **Same expiry as access token** for consistency
- **Tokens are JWT**: JSON Web Tokens that can be decoded and verified

**Line 73:**
```typescript
  refreshTokenValidity: cdk.Duration.days(30),
```
- **Refresh token lasts 30 days**
- **Refresh token**: Used to obtain new access tokens without re-entering password
- **`Duration.days(30)`**: After 30 days, user must log in again
- **Extended session**: Balances security and user convenience

**Line 74:**
```typescript
  generateSecret: false,
```
- **Does NOT generate a client secret**
- **`false` for browser/mobile apps**: They can't securely store secrets
- **`true` for backend apps**: Can safely store secrets
- **Client Secret**: Sensitive credential used with confidential clients
- **Security**: Public clients (browser apps) should never have a secret

---

### **Admin Group Creation Block (Lines 78-83)**

**Line 78:**
```typescript
new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
```
- **Creates a user group** named "AdminGroup"
- **Groups**: Collections of users with similar permissions
- **`CfnUserPoolGroup`**: Cognito User Pool Group resource

**Line 79:**
```typescript
  userPoolId: userPool.userPoolId,
```
- **Associates group** with the User Pool
- **`userPoolId`**: Unique identifier of the User Pool
- **Links**: This group belongs to our User Pool

**Line 80:**
```typescript
  groupName: 'admin',
```
- **Group name**: `admin`
- **Used in authorization**: App checks if user's group is "admin"
- **User permissions**: Users in this group have admin-level access

**Line 81:**
```typescript
  description: 'Full access — manage all resources',
```
- **Describes group purpose**
- **Documentation**: Explains what admins can do
- **Visibility**: Shows in AWS Console for clarity

**Line 82:**
```typescript
  precedence: 1,
```
- **Priority level: 1** (higher priority)
- **`precedence`**: Lower number = higher priority
- **Use case**: If user is in multiple groups, lower precedence wins
- **Admin priority**: Ensures admins get highest privilege level

---

### **User Group Creation Block (Lines 85-90)**

**Line 85:**
```typescript
new cognito.CfnUserPoolGroup(this, 'UserGroup', {
```
- **Creates a user group** named "UserGroup"
- **Standard users**: Less privileged than admins

**Line 86:**
```typescript
  userPoolId: userPool.userPoolId,
```
- **Associates group** with the User Pool (same as admin group)

**Line 87:**
```typescript
  groupName: 'user',
```
- **Group name**: `user`
- **Standard user permissions**: Limited access to specific features

**Line 88:**
```typescript
  description: 'Field access — update progress and attendance only',
```
- **Limited permissions**: Can only update progress and attendance
- **Restrictions**: Cannot manage users or system settings

**Line 89:**
```typescript
  precedence: 2,
```
- **Priority level: 2** (lower priority than admin)
- **Lower precedence number** = higher privilege
- **User group**: Standard permissions for field workers

---

### **Outputs Block (Lines 93-101)**

**Lines 93-96:**
```typescript
new cdk.CfnOutput(this, 'UserPoolId', {
  value:       userPool.userPoolId,
  description: 'Cognito User Pool ID',
});
```
- **Outputs the User Pool ID**
- **`new cdk.CfnOutput()`**: Creates a CloudFormation output
- **`value: userPool.userPoolId`**: The User Pool's unique ID
- **`description`**: Explains what this output is
- **Visible in**: CloudFormation stack outputs and `cdk deploy` terminal

**Lines 98-101:**
```typescript
new cdk.CfnOutput(this, 'UserPoolClientId', {
  value:       userPoolClient.userPoolClientId,
  description: 'Cognito App Client ID',
});
```
- **Outputs the Client ID**
- **`userPoolClient.userPoolClientId`**: The app client's unique ID
- **Frontend needs this**: React/Vue frontend uses this ID to connect to Cognito
- **Configuration**: Copy this ID into your frontend environment variables

---

## Architecture & Flow Diagram

### **System Architecture Overview**

```
┌─────────────────────────────────────────────────────────────────────┐
│                       BUILDTRACK APPLICATION                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────┐      ┌──────────────────────┐             │
│  │   Frontend App       │      │   Backend API        │             │
│  │   (React/Vue)        │      │   (Lambda/Node.js)   │             │
│  │                      │      │                      │             │
│  │ Uses ClientID        │      │ Verifies JWT Tokens  │             │
│  └──────────┬───────────┘      └──────────┬───────────┘             │
│             │                             │                         │
└─────────────┼─────────────────────────────┼─────────────────────────┘
              │                             │
              │      AWS Cognito            │
              └─────────────────────────────┘
              │
    ┌─────────┴──────────────────────────┐
    │                                    │
    ▼                                    ▼
┌──────────────────────────────────┐  ┌─────────────────────────┐
│     User Pool                    │  │   User Groups           │
│  (buildtrack-users)              │  │                         │
│                                  │  │  ┌─────────────────────┐│
│  Email Attribute:                │  │  │ Admin Group         ││
│  • Required                      │  │  │ (precedence: 1)     ││
│  • Mutable                       │  │  │ • Full access       ││
│                                  │  │  └─────────────────────┘│
│  Password Policy:                │  │                         │
│  • Min 8 chars                   │  │  ┌─────────────────────┐│
│  • Uppercase + Lowercase         │  │  │ User Group          ││
│  • Must have digits              │  │  │ (precedence: 2)     ││
│                                  │  │  │ • Field-level only  ││
│  App Client                      │  │  └─────────────────────┘│
│  (buildtrack-app-client)         │  │                         │
│  • No client secret              │  └─────────────────────────┘
│  • Auth flows enabled:           │
│    - UserPassword                │
│    - UserSRP                     │
│    - AdminUserPassword           │
│                                  │
│  Token Validity:                 │
│  • Access: 1 hour                │
│  • ID: 1 hour                    │
│  • Refresh: 30 days              │
└──────────────────────────────────┘

```

---

### **Authentication Flow Diagram**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       USER LOGIN FLOW                                    │
└──────────────────────────────────────────────────────────────────────────┘

Step 1: User Enters Credentials
┌──────────────────┐
│  Frontend App    │
│  Email + Pwd     │
└────────┬─────────┘
         │
         │ 1. Send (email, password, clientID)
         │
         ▼
┌──────────────────────────────┐
│   AWS Cognito User Pool      │
│                              │
│  1. Find user by email       │
│  2. Verify password          │
│  3. Check user groups        │
└────────┬─────────────────────┘
         │
         │ 2. Return JWT Tokens
         │
         ▼
┌──────────────────────────────┐
│  Frontend App Gets:          │
│                              │
│  ✓ accessToken (1 hr)        │
│  ✓ idToken (1 hr)            │
│  ✓ refreshToken (30 days)    │
│  ✓ User Info (email, name)   │
│  ✓ Groups (admin/user)       │
└──────────────────────────────┘

         │
         │ 3. Store tokens in browser (localStorage/cookie)
         │
         ▼
┌──────────────────────────────┐
│  User is Authenticated       │
│  Can call Backend APIs       │
└──────────────────────────────┘

```

---

### **Token Usage Flow**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    USING TOKENS TO ACCESS RESOURCES                      │
└──────────────────────────────────────────────────────────────────────────┘

Frontend App makes API request:

┌──────────────────────────┐
│  API Request             │
│  Header:                 │
│  Authorization:          │
│  Bearer [accessToken]    │
└────────┬─────────────────┘
         │
         │ Send request with JWT token
         │
         ▼
┌────────────────────────────────────────┐
│   Backend API (Lambda/Node.js)         │
│                                        │
│   1. Extract token from header         │
│   2. Verify signature with Cognito     │
│   3. Check if token expired            │
│   4. Extract user info from token      │
│   5. Extract groups from token         │
└────────┬─────────────────────────────┘
         │
         ├─ Is token valid?
         │
         ├─ YES ─────────────────────┐
         │                           │
         │                           ▼
         │                   ┌──────────────────────┐
         │                   │ Check Authorization  │
         │                   │                      │
         │                   │ Is user in group:    │
         │                   │ admin or user?       │
         │                   └────────┬─────────────┘
         │                            │
         │                    ┌───────┴────────┐
         │                    │                │
         │               Admin ✓          User ✓
         │                    │                │
         │                    ▼                ▼
         │        ┌─────────────────┐  ┌────────────────┐
         │        │ Full Access     │  │ Limited Access │
         │        │ • All endpoints │  │ • Progress API │
         │        │ • All resources │  │ • Attendance   │
         │        └─────────────────┘  └────────────────┘
         │
         └─ NO ──────────────────────┐
                                     │
                                     ▼
                            ┌──────────────────────┐
                            │ Return 401/403       │
                            │ Unauthorized         │
                            │ Ask user to re-login │
                            └──────────────────────┘

```

---

### **Token Refresh Flow**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    REFRESHING EXPIRED TOKENS                              │
└──────────────────────────────────────────────────────────────────────────┘

Access Token Expires (1 hour):

┌──────────────────────────┐
│  Frontend App            │
│  accessToken: EXPIRED    │
│  refreshToken: VALID     │
└────────┬─────────────────┘
         │
         │ 1. Send refreshToken to Cognito
         │
         ▼
┌──────────────────────────────────┐
│   AWS Cognito User Pool          │
│                                  │
│   1. Validate refreshToken       │
│   2. Check expiry (30 days)      │
│   3. Generate new accessToken    │
│   4. Generate new idToken        │
└────────┬─────────────────────────┘
         │
         │ 2. Return new tokens
         │
         ▼
┌──────────────────────────┐
│  Frontend Stores:        │
│  ✓ New accessToken       │
│  ✓ New idToken           │
│  (refreshToken unchanged)│
└──────────────────────────┘

Timeline:
├─ 0 hours: Login ──► accessToken valid
├─ 1 hour: accessToken expires ──► Use refreshToken
├─ 1 hour: Get new accessToken ──► Continue working
├─ 2 hours: New accessToken expires ──► Use refreshToken again
│  ...
└─ 30 days: refreshToken expires ──► Must login again

```

---

### **Permission Flow - Who Can Do What?**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      AUTHORIZATION BY GROUP                               │
└──────────────────────────────────────────────────────────────────────────┘

User: john@example.com (Group: admin)
Token contains: groups: ["admin"]

Backend checks:
if (user.groups.includes("admin")) {
  ✓ Can create users
  ✓ Can delete users
  ✓ Can view reports
  ✓ Can manage settings
  ✓ Can update progress
  ✓ Can update attendance
}


User: field@example.com (Group: user)
Token contains: groups: ["user"]

Backend checks:
if (user.groups.includes("user")) {
  ✓ Can update progress
  ✓ Can update attendance
  ✗ Cannot create users
  ✗ Cannot delete users
  ✗ Cannot view reports
  ✗ Cannot manage settings
}

```

---

### **Data Flow Summary**

```
1. SETUP (What happens when cdk deploy runs):
   ┌─ Creates User Pool in AWS Cognito
   ├─ Configures password policy
   ├─ Creates 2 groups: admin, user
   ├─ Creates app client
   └─ Outputs: UserPoolId, UserPoolClientId

2. USER SIGNUP (Admin creates user):
   ┌─ Admin goes to Cognito Console
   ├─ Creates new user with email
   ├─ System sends temporary password
   ├─ Admin assigns user to group (admin or user)
   └─ User receives email with temp password

3. USER LOGIN (User enters credentials):
   ┌─ Frontend sends email + password + clientID
   ├─ Cognito verifies credentials
   ├─ Cognito retrieves user's groups
   ├─ Cognito generates 3 tokens
   └─ Frontend stores tokens

4. API REQUEST (Frontend calls backend):
   ┌─ Frontend sends accessToken in Authorization header
   ├─ Backend verifies token with Cognito
   ├─ Backend extracts user groups from token
   ├─ Backend checks if user's group has permission
   └─ Backend returns data or 403 error

5. REFRESH (Token expires):
   ┌─ Frontend detects accessToken expired
   ├─ Frontend sends refreshToken to Cognito
   ├─ Cognito generates new accessToken
   └─ Frontend resumes API calls

```

---

## Key Takeaways

| Component | Purpose | Security Feature |
|-----------|---------|------------------|
| **User Pool** | Central authentication service | Password policy, email verification |
| **App Client** | Frontend's bridge to User Pool | No client secret for browser apps |
| **Access Token** | Proves authentication for API calls | Expires in 1 hour |
| **Refresh Token** | Gets new access tokens | Lasts 30 days |
| **Groups** | Controls who can do what | Precedence system for conflicts |
| **SignIn Aliases** | Users can login with email | More user-friendly than username |
| **Retention Policy** | Prevents accidental deletion | Data protected even if cdk destroy runs |
