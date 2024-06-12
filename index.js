import express from 'express';
import session from 'express-session';
import { open } from "sqlite";
import sqlite3 from 'sqlite3'
import bcrypt from 'bcrypt'

const dbPromise = open({
    filename: 'database.db',
    driver: sqlite3.Database
});

const app = express();
const port = 3000;

app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));


// Routes will be added here

app.listen(port, () => {
    console.log(`Server er startet her: http://localhost:${port}`);
});

app.get('/', (req, res) => {
    res.render('login');
});

app.get("/register", async (req, res) => {
    res.render("register");
})

app.post("/register", async (req, res) => {
    const db = await dbPromise;

    const { fname, lname, email, password, passwordRepeat } = req.body;

    if (password != passwordRepeat) {
        res.render("register", { error: "Password must match." })
        return;
    }
    const passwordHash = await bcrypt.hash(password, 10);

    // Tabellen eg bruker heiter "users" og har kolonnene "firstname", "lastname", "email" og "password"
    await db.run("INSERT INTO users (firstname, lastname, email, password) VALUES (?, ?, ?, ?)", fname, lname, email, passwordHash);
    res.redirect("/");

})

app.post('/auth', async function (req, res) {

    const db = await dbPromise;

    const { email, password } = req.body;
    let getUserDetails = `SELECT * FROM users WHERE email = '${email}'`;
    let checkInDb = await db.get(getUserDetails);
    if (checkInDb === undefined) {
        res.status(400);
        res.send("Invalid user" + getUserDetails);
    } else {
        const isPasswordMatched = await bcrypt.compare(
            password,
            checkInDb.password
        );

        if (isPasswordMatched) {
            res.status(200);
            if (checkInDb.role == 1) { // ADMIN SYSTEM
                req.session.admin = true;
               
            }
            // If the account exists
            // Authenticate the user
            req.session.loggedin = true;
            req.session.email = email;
            req.session.userid = checkInDb.id; 
            // Redirect to home page
            res.redirect('/home');
        } else {
            res.status(400);
            res.send("Invalid password");
            res.redirect("/");
        }

    }

});

// http://localhost:3000/home
app.get('/home', function (req, res) {
    // If the user is loggedin
    if (req.session.loggedin) {
        // Output username
        const user = req.session.email;
        const admin = req.session.admin; // ADMIN SYSTEM
        res.render('home', { user, admin }); // ADMIN SYSTEM
    } else {
        // Not logged in
        res.send('Please login to view this page!');
    }
});

app.post('/products', async (req, res) => {
    const { category } = req.body;
    const db = await dbPromise;

    const query = 'SELECT * FROM products WHERE category = ?';
    const products = await db.all(query, [category]);

    res.render('products', { products });

});

app.get("/logout", async (req, res) => {

    req.session.loggedin = false;
    req.session.username = '';
    req.session.admin = false; // ADMIN SYSTEM
    res.redirect("/")
})

// ADMIN SYSTEM
app.get('/profile', async function (req, res) {
    if (req.session.loggedin) {
        const userid = req.session.userid;
        const db = await dbPromise;
        let getUserDetails = `SELECT * FROM users WHERE id = '${userid}'`;
        let user = await db.get(getUserDetails);     

        if (user === undefined) {
            res.status(400);
            res.send("Invalid user");
        } else {
            res.status(200);
            res.render('profile', { userid, user });
        }
    }
});


// Rute for å håndtere POST-forespørsler til '/admin/delete/:id'.
app.post('/profile/delete/:id', async (req, res) => {
    const id = req.params.id;  // Henter ID fra URL-parameteren.
    const db = await dbPromise; // Venter på at databasetilkoblingen skal være klar.
    const query = 'DELETE FROM users WHERE id = ?';
    
    try {
        await db.run(query, id); // Utfører sletting av brukeren fra databasen.
        console.log('Deleted user with ID:', id); // Logger ID-en til brukeren som ble slettet.
        res.redirect('/');  // Omdirigerer tilbake til admin-siden etter sletting.
    } catch (error) {
        console.error('Error when deleting:', error); // Logger eventuelle feil under sletting.
        res.status(500).send("Unable to delete user.");  // Sender feilmelding hvis sletting feiler.
    }
});



// ADMIN SYSTEM
app.get('/admin', async function (req, res) {
    if (req.session.loggedin) {
        const user = req.session.email;
        const db = await dbPromise;
        let getUserDetails = `SELECT * FROM users WHERE email = '${user}' AND role = 1`;
        let checkInDb = await db.get(getUserDetails);
        const query = 'SELECT * FROM users';
        const users = await db.all(query);

        if (checkInDb === undefined) {
            res.status(400);
            res.send("Invalid user");
        } else {
            let admin = true;
            res.status(200);
            res.render('admin', { user, admin, users });
        }
    }
});


// Rute for å håndtere GET-forespørsler til '/admin/edit/:id', hvor ':id' er en variabel del av URL-en.
app.get('/admin/edit/:id', async function (req, res) {
    const admin = req.session.admin; // Henter 'admin'-status fra brukerens session.

    if (admin) { // Sjekker om brukeren er admin.
        const db = await dbPromise; // Venter på at databasetilkoblingen skal være klar.
        const id = req.params.id; // Henter brukerens ID fra URL-parameteren.
        const query = `SELECT * FROM users WHERE id=${id}`; // SQL-spørring for å hente brukerdata basert på ID.
        const user = await db.all(query); // Utfører SQL-spørringen og henter brukerdata.

        if (user === undefined) { // Sjekker om brukeren finnes.
            res.status(400);
            res.send("Invalid user"); // Sender feilmelding hvis brukeren ikke finnes.
        } else {
            res.status(200);
            res.render('edit', { user: user[0], admin}); // Sender brukerdata til 'edit' visningen.
        }
    }
    else {
        res.status(400);
        res.send("Not admin"); // Sender feilmelding hvis brukeren ikke er admin.
    }
});

// Rute for å håndtere POST-forespørsler til '/admin/edit/:id'.
app.post('/admin/edit/:id', async function (req, res) {
    const admin = req.session.admin; // Henter 'admin'-status fra session.
    
    if (admin) { // Sjekker om brukeren er admin.
        const id = req.params.id; // Henter brukerens ID fra URL-parameteren.
        const updateData = req.body; // Henter data som skal oppdateres fra forespørselskroppen.
        const db = await dbPromise; // Venter på at databasetilkoblingen skal være klar.
        const fields = Object.keys(updateData).map(field => `${field} = ?`).join(", "); // Bygger delen av SQL-spørringen som spesifiserer feltene som skal oppdateres.
        const values = Object.values(updateData); // Henter verdiene som skal oppdateres.
        
        // Legger til bruker-ID til verdilisten for parameterisering
        values.push(id);
        
        const query = `UPDATE users SET ${fields} WHERE id = ?`; // Bygger den fulle SQL-spørringen for oppdatering.

        try {
            const result = await db.run(query, values); // Utfører oppdateringen i databasen.
            console.log(result.changes + " record(s) updated"); // Logger antall rader som er oppdatert.
            res.redirect('/admin'); // Omdirigerer brukeren tilbake til admin-siden.
        } catch (error) {
            console.error('Error when updating:', error); // Logger eventuelle feil under oppdatering.
        }
    }
    else {
        res.status(400);
        res.send("Not authorized"); // Sender feilmelding hvis brukeren ikke er admin.
    }
});

// Rute for å håndtere POST-forespørsler til '/admin/delete/:id'.
app.post('/admin/delete/:id', async (req, res) => {
    const id = req.params.id;  // Henter ID fra URL-parameteren.
    const db = await dbPromise; // Venter på at databasetilkoblingen skal være klar.
    const query = 'DELETE FROM users WHERE id = ?';
    
    try {
        await db.run(query, id); // Utfører sletting av brukeren fra databasen.
        console.log('Deleted user with ID:', id); // Logger ID-en til brukeren som ble slettet.
        res.redirect('/admin');  // Omdirigerer tilbake til admin-siden etter sletting.
    } catch (error) {
        console.error('Error when deleting:', error); // Logger eventuelle feil under sletting.
        res.status(500).send("Unable to delete user.");  // Sender feilmelding hvis sletting feiler.
    }
});
