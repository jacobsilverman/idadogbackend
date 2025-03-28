const express = require('express');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');
// const path = require('path');
const admin = require('firebase-admin');

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors({
    origin: ['https://idadog.com', 'https://www.idadog.com', 'http://localhost:5173', 'https://jacobsilverman.github.io', 'https://pokemonlookup.com', 'https://www.pokemonlookup.com'],  // replace with your GitHub Pages domain
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
    databaseURL: 'https://IdaDog.firebaseio.com',
});

const db = admin.firestore();

app.post('/send-email', (req, res) => {
    const { to, subject, html } = req.body;

    // Validate the required fields
    if (!to || !subject || !html) {
        return res.status(400).send('Missing required fields: to, subject, and html');
    }

    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!isValidEmail(to)) {
        return res.status(400).send('Invalid email address');
    }

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
        console.log("info: ",info);
        console.log("error: ",error);

        if (error) {
            console.error('Error sending email:', error);

            // Provide specific status codes based on the type of error
            if (error.responseCode) {
                // Use the error's response code if provided
                return res.status(error.responseCode).send(`Error sending email: ${error.message}`);
            } else {
                // Default to 500 for unexpected errors
                return res.status(500).send('Error sending email. Please try again later.');
            }
        }

        console.log('Email sent: ' + info.response);
        res.status(200).send('Email sent successfully');
    });
});


app.post('/delete-reservation', async (req, res) => {
    const { id } = req.body;
    
    if (!id) {
        return res.status(400).send('Reservation ID is required');
    }

    try {
        const reservationRef = db.collection('reservations').doc(id);
        const reservationDoc = await reservationRef.get();

        if (!reservationDoc.exists) {
            return res.status(404).send('Reservation not found');
        }

        await reservationRef.delete();
        res.status(200).send(`Reservation with ID: ${id} successfully deleted`);
    } catch (error) {
        console.error('Error deleting reservation:', error);
        res.status(500).send('Failed to delete reservation');
    }
});

app.get('/confirm-reservation', async (req, res) => {
    try {
        // Extract query parameters
        const { n: name, p: phone, em: email, s: start, e: end, st: startTime, et: endTime } = req.query;

        if (!name || !start || !end || !email) {
            return res.status(400).send('Missing required fields');
        }

        // Check if the reservation is already confirmed
        const existingReservation = await db.collection('reservations')
            .where('email', '==', email)
            .where('start', '==', start)
            .where('end', '==', end)
            .get();

        if (!existingReservation.empty) {
            // Reservation already exists
            return res.send(`
                <html>
                    <body style="font-family: sans-serif; text-align: center;">
                        <h1>Reservation Already Confirmed!</h1>
                        <p>This reservation has already been confirmed for ${name}.</p>
                    </body>
                </html>
            `);
        }

        // Save to Firebase (Firestore example)
        await db.collection('reservations').add({
            name,
            phone,
            email,
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
                    <p>Thank you for confirming your reservation. We're excited to serve you, ${name}!</p>
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


const VITE_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";  // Example for GPT
const VITE_OPENAI_API_KEY= process.env.VITE_OPENAI_API_KEY;

app.post("/pokemonlookup/openai/fetch", async (req, res) => {
    try {
        const { query } = req.body;
        let pokemonSets = "Base Set, Jungle, Fossil, Base Set 2, Team Rocket, Gym Heroes, Gym Challenge, Neo Genesis, Neo Discovery, Neo Revelation, Neo Destiny, Legendary Collection, Expedition Base Set, Aquapolis, Skyridge, EX Ruby & Sapphire, EX Sandstorm, EX Dragon, EX Team Magma vs Team Aqua, EX Hidden Legends, EX FireRed & LeafGreen, EX Team Rocket Returns, EX Deoxys, EX Emerald, EX Unseen Forces, EX Delta Species, EX Legend Maker, EX Holon Phantoms, EX Crystal Guardians, EX Dragon Frontiers, EX Power Keepers, Diamond & Pearl, Mysterious Treasures, Secret Wonders, Great Encounters, Majestic Dawn, Legends Awakened, Stormfront, Platinum, Rising Rivals, Supreme Victors, Arceus, HeartGold & SoulSilver, Unleashed, Undaunted, Triumphant, Black & White, Emerging Powers, Noble Victories, Next Destinies, Dark Explorers, Dragons Exalted, Dragon Vault, Boundaries Crossed, Plasma Storm, Plasma Freeze, Plasma Blast, Legendary Treasures, Kalos Starter Set, XY, Flashfire, Furious Fists, Phantom Forces, Primal Clash, Double Crisis, Roaring Skies, Ancient Origins, BREAKthrough, BREAKpoint, Generations, Fates Collide, Steam Siege, Evolutions, Sun & Moon, Guardians Rising, Burning Shadows, Shining Legends, Crimson Invasion, Ultra Prism, Forbidden Light, Celestial Storm, Dragon Majesty, Lost Thunder, Team Up, Detective Pikachu, Unbroken Bonds, Unified Minds, Hidden Fates, Cosmic Eclipse, Sword & Shield, Rebel Clash, Darkness Ablaze, Champion's Path, Vivid Voltage, Battle Styles, Chilling Reign, Evolving Skies, Celebrations, Fusion Strike, Brilliant Stars, Astral Radiance, Pokemon Go, Lost Origins, Silver Tempest, Crown Zenith, Scarlet & Violet, Paldea Evolved, Obsidian Flames, 151, Paradox Rift, Paldean Fates, Temporal Forces, Twilight Masquerade, Shrouded Fable, Stellar Crown, Surging Sparks, Prismatic Evolutions, Journey Together";
        pokemonSets = pokemonSets.split(",").reverse().join(",");

        const prompt = `From the image make an array thats size is determined by the number of pokemon cards seen in the image. Look at each card and gather these pieces of information: the name of the pokemon on the card (not the evolution in the top left), zoom in and please very carefully read the set number seen at the bottom left or right which will have two numbers and a slash in between, and based on the set number determine the set that released this card (please refer to this list ${pokemonSets} to determine the set name). You might have trouble determining the set number and if the image is hard to read please try to determine the set it comes from and research what the set number would be instead of blindly following the image. Write it in this format '{pokemon} {set #} {set}', with no other text, then add that string value to the array`

        const response = await axios.post(VITE_OPENAI_API_URL, 
        {
            model: "gpt-4o-mini",
            messages: [
            {
                role: "user",
                content: [
                { type: "text", text: prompt },
                {
                    type: "image_url",
                    image_url: {
                    "url": query,
                    },
                },
                ],
            },
            ],
        },
        {
            headers: {
            "Authorization": `Bearer ${VITE_OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            },
        });
        console.log(response.data);
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching open ai generated items:", error);
        res.status(500).json({ error: error?.response?.data || "Failed to fetch data from eBay" });
    }
});

// Serve static files from the React app
// app.use(express.static(path.join(__dirname, '../IdaDog/dist')));

// Catch-all handler for client-side routing (React Router)
// app.get('/schedule', (req, res) => {
//     res.sendFile(path.join(__dirname, '../IdaDog/dist/index.html'));
// });


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});