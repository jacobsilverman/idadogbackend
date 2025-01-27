const express = require('express');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const cors = require('cors');
const admin = require('firebase-admin');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
    origin: ['https://idadog.com', 'https://www.idadog.com', 'http://localhost:5173', 'https://jacobsilverman.github.io',],  // replace with your GitHub Pages domain
    credentials: true,
    methods: ['GET', 'POST'],
}));

const PORT = process.env.PORT || 5000;

const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID, 
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // To correctly handle newlines
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT,
    universe_domain: "googleapis.com"
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://IdaDog.firebaseio.com', // Replace with your project's database URL
});

const db = admin.firestore();

app.post('/send-email', (req, res) => {
    const { to, subject, html } = req.body;

    const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.send('Email sent successfully');
        }
    });
});

app.get('/confirm-reservation', async (req, res) => {
    try {
        // Extract query parameters
        const { n: name, p: phone, s: start, e: end, st: startTime, et: endTime } = req.query;

        if (!name || !start || !end) {
            return res.status(400).send('Missing required fields');
        }

        // Save to Firebase (Firestore example)
        await db.collection('reservations').add({
            name,
            phone,
            start,
            end,
            startTime: startTime || null,
            endTime: endTime || null,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Send a success message
        res.send(`
            <html>
                <body style="font-family: sans-serif; text-align: center;">
                    <h1>Reservation Confirmed!</h1>
                    <p>Thank you for confirming your reservation. We're excited to serve you ${name}!</p>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error confirming reservation:', error);
        res.status(500).send('Error confirming reservation');
    }
});

app.get('/reservations', async (req, res) => {
    try {
        const reservationsSnapshot = await db.collection('reservations').get();

        // Convert Firestore documents to an array of objects
        const reservations = reservationsSnapshot.docs.map((doc) => ({
            id: doc.id, // Include document ID for reference
            ...doc.data(),
        }));

        res.status(200).json(reservations);
    } catch (error) {
        console.error('Error retrieving reservations:', error);
        res.status(500).send('Failed to retrieve reservations');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});