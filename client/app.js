// connect to websocket server
const socket = new WebSocket("ws://localhost:3000");

let keyPair;

// generate ECDH keypair when client loads
async function generateKeys() {

    keyPair = await crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveBits"]
    );

    console.log("ECDH keys generated");

}

generateKeys();


// =========================
// helpers
// =========================

function bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}


// =========================
// password -> key material
// =========================

async function passwordKey(password) {

    const enc = new TextEncoder();

    return crypto.subtle.digest(
        "SHA-256",
        enc.encode(password)
    );

}


// =========================
// compute ECDH secret
// =========================

async function computeDH(remotePublicKey) {

    const imported = await crypto.subtle.importKey(
        "jwk",
        remotePublicKey,
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        []
    );

    const secret = await crypto.subtle.deriveBits(
        {
            name: "ECDH",
            public: imported
        },
        keyPair.privateKey,
        256
    );

    return secret;

}


// =========================
// combine secrets
// =========================

async function deriveAESKey(dhSecret, password) {

    const pw = await passwordKey(password);

    const combined = new Uint8Array([
        ...new Uint8Array(dhSecret),
        ...new Uint8Array(pw)
    ]);

    const hash = await crypto.subtle.digest(
        "SHA-256",
        combined
    );

    return crypto.subtle.importKey(
        "raw",
        hash,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );

}


// =========================
// encrypt message
// =========================

async function encryptMessage(message, aesKey) {

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const enc = new TextEncoder();

    const cipher = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        aesKey,
        enc.encode(message)
    );

    return {
        cipher: bufferToBase64(cipher),
        iv: bufferToBase64(iv)
    };

}


// =========================
// send message
// =========================

async function sendMessage() {

    const password = document.getElementById("password").value;
    const message = document.getElementById("message").value;

    if (!password || !message) {
        alert("Enter password and message");
        return;
    }

    const publicKey = await crypto.subtle.exportKey(
        "jwk",
        keyPair.publicKey
    );

    // compute DH with our own key (demo broadcast mode)
    const dh = await computeDH(publicKey);

    const aesKey = await deriveAESKey(dh, password);

    const encrypted = await encryptMessage(message, aesKey);

    const payload = {

        pub: publicKey,
        iv: encrypted.iv,
        cipher: encrypted.cipher

    };

    socket.send(JSON.stringify(payload));

}


// =========================
// receive message
// =========================

socket.onmessage = async function(event) {

    const data = JSON.parse(event.data);

    const password = document.getElementById("password").value;

    try {

        const dh = await computeDH(data.pub);

        const aesKey = await deriveAESKey(dh, password);

        const decrypted = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: new Uint8Array(base64ToBuffer(data.iv))
            },
            aesKey,
            base64ToBuffer(data.cipher)
        );

        const dec = new TextDecoder();

        const message = dec.decode(decrypted);

        const container = document.getElementById("messages");

        container.innerHTML += `<p>${message}</p>`;

    }
    catch (e) {

        console.log("Decryption failed for this client");

    }

};