const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const textToImage = require('text-to-image');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');


// Replace these values with your actual AWS access key ID and secret key
require('dotenv').config(); // Load environment variables from .env file

const accessKeyId = process.env.ACCESS_KEY_ID;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const pathToProfile = path.join(process.env.APPDATA || (os.homedir() + '\\AppData\\Roaming'), 'Elgato', 'StreamDeck', 'ProfilesV2');

// Create an S3 client with configured credentials
const sqsClient = new SQSClient({
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    },
    region: "ca-central-1" // Replace with your AWS region
});

const queueUrl = process.env.QUEUE_URL; // Replace with your SQS queue URL

// Function to poll for messages
async function pollForMessages() {
    try {
        // Create a command to receive messages from the queue
        const receiveMessageCommand = new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10, // Maximum number of messages to retrieve
            VisibilityTimeout: 30,   // Visibility timeout in seconds
            WaitTimeSeconds: 5      // Wait time for long polling in seconds
        });

        // Send the command and handle the response
        const data = await sqsClient.send(receiveMessageCommand);

        if (data.Messages && data.Messages.length > 0) {
            console.log("Received Messages:");
            // Process each received message
            for (const message of data.Messages) {
                console.log("Processing message with body: ", message.Body);
                await generateAndSaveImage(message.Body);
                await deleteMessage(message.ReceiptHandle);
            }
        } else {
            console.log("No messages available in the queue.");
        }

        // Continue polling for messages
        await pollForMessages();
    } catch (error) {
        console.error("Error receiving messages:", error);
    }
}

async function generateAndSaveImage(message) {
    const dataUri = await textToImage.generate(message, {
        maxWidth: 800,
        customHeight: 100,
        fontSize: 18,
        fontFamily: 'Arial',
        lineHeight: 30,
        margin: 5,
        bgColor: 'blue',
        textColor: 'red',
    });

    saveRecentWinner(dataUri);
}

// Function to delete a message from the queue
async function deleteMessage(receiptHandle) {
    try {
        const deleteMessageCommand = new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle
        });
        await sqsClient.send(deleteMessageCommand);
        console.log("Deleted message:", receiptHandle);
    } catch (error) {
        console.error("Error deleting message:", error);
    }
}

function getMostRecentFolderSync() {
    try {
        const files = fs.readdirSync(pathToProfile, { withFileTypes: true });
        const folders = files.filter(file => file.isDirectory());
        const sortedFolders = folders.sort((a, b) => {
            const aStat = fs.statSync(path.join(pathToProfile, a.name));
            const bStat = fs.statSync(path.join(pathToProfile, b.name));
            return bStat.mtime.getTime() - aStat.mtime.getTime();
        });
        return sortedFolders[0].name;
    } catch (error) {
        console.error('Error accessing folder:', error);
        return null;
    }
}


// Start polling for messages
pollForMessages();


function saveRecentWinner(dataUri) {
    const mostRecentFolder = getMostRecentFolderSync();
    const profilesPath = path.join(pathToProfile, mostRecentFolder, 'Profiles');

    // Find the most recent profile
    const mostRecentProfile = getMostRecentProfile(profilesPath);

    // Save the winner's image
    const imageFileName = path.join(profilesPath, mostRecentProfile, 'Images', 'winner.png');
    const buffer = Buffer.from(dataUri.split(",")[1], 'base64');
    fs.writeFileSync(imageFileName, buffer);

    // Edit manifest.json and restart StreamDeck
    const manifestPath = path.join(profilesPath, mostRecentProfile, 'manifest.json');
    editManifestJson(manifestPath);
    killProcessByName('StreamDeck.exe');
    startStreamDeck();
}

function getMostRecentProfile(profilesPath) {
    const profiles = fs.readdirSync(profilesPath, { withFileTypes: true });
    const sortedProfiles = profiles.sort((a, b) => {
        const aStat = fs.statSync(path.join(profilesPath, a.name));
        const bStat = fs.statSync(path.join(profilesPath, b.name));
        return bStat.mtime.getTime() - aStat.mtime.getTime();
    });
    return sortedProfiles[0].name;
}


function startStreamDeck() {
    setTimeout(() => {
        exec("C:\\PROGRA~1\\Elgato\\StreamDeck\\StreamDeck.exe", (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Error: ${stderr}`);
                return;
            }
            console.log(stdout);
        });
    }, 300);
}

function editManifestJson(manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.Controllers[1].hasOwnProperty("Background")) {
        // change the image to the new image
        manifest.Controllers[1].Background = "Images/winner.png";
    } else {
        // create it and set the image to the new image
        manifest.Controllers[1].Background = "Images/winner.png";
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

}


function killProcessByName(processName) {
    // Execute system command to find the process ID (PID) by name
    exec(`taskkill /F /IM ${processName}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Error: ${stderr}`);
            return;
        }
        console.log(stdout);
    });
}