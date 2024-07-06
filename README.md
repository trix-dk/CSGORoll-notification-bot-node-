# CSGORoll Notification Bot

This bot connects to the CSGORoll WebSocket API to monitor trades and sends notifications to Discord.

## Setup Guide

### Step 1: Install Node.js and npm

1. **Download Node.js and npm**:
   - Go to the [official Node.js website](https://nodejs.org/).
   - Download and install the LTS version.

2. **Verify Installation**:
   - Open Terminal (macOS/Linux) or Command Prompt (Windows).
   - Run the following commands to ensure Node.js and npm are installed correctly:
     ```bash
     node -v
     npm -v
     ```

### Step 2: Create a New Folder for the Bot

1. **Create a Folder**:
   - Create a new folder named `csgoroll-trade-bot`.

2. **Open Terminal/Command Prompt**:
   - Navigate to the folder you just created:
     ```bash
     cd path/to/csgoroll-trade-bot
     ```

### Step 3: Initialize the Project and Install Dependencies

1. **Initialize a New Node.js Project**:
   - Run the following command to initialize a new Node.js project:
     ```bash
     npm init -y
     ```

2. **Install Required Libraries**:
   - Install the necessary dependencies by running:
     ```bash
     npm install ws uuid moment-timezone axios node-fetch
     ```

### Step 4: Create and Configure `index.js`

1. **Create `index.js` File**:
   - In the `csgoroll-trade-bot` folder, create a new file named `index.js`.

2. **Paste the Code**:
   - Open `index.js` in a text editor and paste the provided code into it.

### Step 5: Update Configuration

1. **Edit the `config` Object in `index.js`**:
   - Replace placeholders with your actual details:
     ```javascript
     let config = {
       cookie: 'your-session-cookie',
       userId: 'your-user-id',
       discordDepositWebhookUrl: 'your-deposit-webhook-url',
       discordWithdrawWebhookUrl: 'your-withdraw-webhook-url'
     };
     ```

### Step 6: Run the Bot

1. **Start the Bot**:
   - In Terminal or Command Prompt, navigate to your project directory if you're not already there:
     ```bash
     cd path/to/csgoroll-trade-bot
     ```
   - Run the bot using the following command:
     ```bash
     node index.js
     ```

### License

This project is licensed under the MIT License.
