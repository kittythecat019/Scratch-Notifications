require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const Scratch = require("scratch-api");
const { Server } = require("socket.io");
const { execFile } = require("child_process");

// ==========================================
// SERVER
// ==========================================

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});

// ==========================================
// SESSION FOLDER
// ==========================================

const SESSION_DIR =
    path.join(__dirname, "sessions");

if (!fs.existsSync(SESSION_DIR)) {

    fs.mkdirSync(
        SESSION_DIR,
        {
            recursive: true
        }
    );
}

// ==========================================
// SESSION FILE
// ==========================================

function getSessionFile(username) {

    const safeUsername =
        username.replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
        );

    return path.join(
        SESSION_DIR,
        `${safeUsername}.json`
    );
}

// ==========================================
// LOAD SESSION
// ==========================================

function loadSession(username) {

    const file =
        getSessionFile(username);

    if (!fs.existsSync(file)) {

        return null;
    }

    try {

        const data =
            JSON.parse(
                fs.readFileSync(
                    file,
                    "utf8"
                )
            );

        return data.sessionId || null;

    } catch (error) {

        console.log(
            `[${username}] Không đọc được session`
        );

        return null;
    }
}

// ==========================================
// SAVE SESSION
// ==========================================

function saveSession(
    username,
    sessionId
) {

    const file =
        getSessionFile(username);

    fs.writeFileSync(
        file,
        JSON.stringify(
            {
                username,
                sessionId,
                savedAt: Date.now()
            },
            null,
            2
        )
    );

    console.log(
        `[${username}] Session đã được lưu`
    );
}

// ==========================================
// DELETE SESSION
// ==========================================

function deleteSession(username) {

    const file =
        getSessionFile(username);

    if (fs.existsSync(file)) {

        fs.unlinkSync(file);

        console.log(
            `[${username}] Session cũ đã xóa`
        );
    }
}

// ==========================================
// ACCOUNTS
// ==========================================

const accounts = [];

for (let i = 1; ; i++) {

    const username =
        process.env[
            `SCRATCH_USER_${i}`
        ];

    const password =
        process.env[
            `SCRATCH_PASS_${i}`
        ];

    if (!username && !password) {

        break;
    }

    if (!username || !password) {

        console.log(
            `Account ${i} thiếu username hoặc password`
        );

        continue;
    }

    const savedSession =
        loadSession(username);

    accounts.push({

        username,

        password,

        sessionId:
            savedSession,

        // X-Token sẽ được lấy bằng auth.py
        xToken:
            null,

        status:
            savedSession
                ? "session_loaded"
                : "login_required"
    });
}

console.log(
    `Đã tải ${accounts.length} tài khoản`
);

// ==========================================
// STATUS
// ==========================================

function setStatus(
    account,
    status
) {

    account.status =
        status;

    console.log(
        `[${account.username}] ${status}`
    );

    io.emit(
        "accountStatus",
        {
            username:
                account.username,

            status
        }
    );
}

// ==========================================
// LOGIN WITH PASSWORD
// ==========================================

function loginWithPassword(
    username,
    password
) {

    return new Promise(
        (resolve, reject) => {

            console.log(
                `[${username}] Đang đăng nhập bằng password...`
            );

            Scratch.UserSession.create(
                username,
                password,
                (err, user) => {

                    if (err) {

                        reject(err);

                        return;
                    }

                    if (!user) {

                        reject(
                            new Error(
                                "Không nhận được user"
                            )
                        );

                        return;
                    }

                    if (!user.sessionId) {

                        reject(
                            new Error(
                                "Không nhận được sessionId"
                            )
                        );

                        return;
                    }

                    console.log(
                        `[${username}] LOGIN OK!`
                    );

                    console.log(
                        `[${username}] Session ID đã nhận`
                    );

                    resolve(
                        user.sessionId
                    );
                }
            );
        }
    );
}

// ==========================================
// LOGIN ACCOUNT
// ==========================================

async function loginAccount(
    account
) {

    setStatus(
        account,
        "logging_in"
    );

    try {

        const sessionId =
            await loginWithPassword(
                account.username,
                account.password
            );

        account.sessionId =
            sessionId;

        // Token cũ không còn dùng được
        account.xToken =
            null;

        saveSession(
            account.username,
            sessionId
        );

        setStatus(
            account,
            "online"
        );

        return true;

    } catch (error) {

        console.log(
            `[${account.username}] Login lỗi:`,
            error.message
        );

        account.sessionId =
            null;

        account.xToken =
            null;

        setStatus(
            account,
            "login_error"
        );

        return false;
    }
}

// ==========================================
// GET AUTH FROM PYTHON
// ==========================================

function getAuthFromPython(
    sessionId,
    username
) {

    return new Promise(
        (resolve, reject) => {

            console.log(
                `[${username}] Đang gọi auth.py...`
            );

            execFile(
                "uv",
                [
                    "run",
                    "python",
                    "auth.py",
                    sessionId,
                    username
                ],
                {
                    maxBuffer:
                        1024 * 1024
                },
                (
                    error,
                    stdout,
                    stderr
                ) => {

                    if (error) {

                        console.log(
                            `[${username}] auth.py lỗi:`,
                            stderr ||
                            error.message
                        );

                        reject(error);

                        return;
                    }

                    try {

                        const data =
                            JSON.parse(
                                stdout
                            );

                        if (data.error) {

                            reject(
                                new Error(
                                    data.error
                                )
                            );

                            return;
                        }

                        if (!data.xToken) {

                            reject(
                                new Error(
                                    "AUTH_NO_XTOKEN"
                                )
                            );

                            return;
                        }

                        resolve(data);

                    } catch (err) {

                        console.log(
                            `[${username}] auth.py trả về không hợp lệ`
                        );

                        console.log(
                            "stdout:",
                            stdout
                        );

                        console.log(
                            "stderr:",
                            stderr
                        );

                        reject(err);
                    }
                }
            );
        }
    );
}

// ==========================================
// ENSURE X-TOKEN
// ==========================================

async function ensureXToken(
    account
) {

    if (account.xToken) {

        return true;
    }

    if (!account.sessionId) {

        throw new Error(
            "NO_SESSION"
        );
    }

    console.log(
        `[${account.username}] Đang lấy X-Token...`
    );

    const auth =
        await getAuthFromPython(
            account.sessionId,
            account.username
        );

    account.xToken =
        auth.xToken;

    console.log(
        `[${account.username}] X-Token đã lấy thành công`
    );

    return true;
}

// ==========================================
// GET NOTIFICATIONS
// ==========================================

async function getNotifications(
    account
) {

    // Đảm bảo có X-Token trước khi request
    await ensureXToken(
        account
    );

    return new Promise(
        (resolve, reject) => {

            const url =
                `https://api.scratch.mit.edu/users/${encodeURIComponent(account.username)}/messages?limit=40&offset=0`;

            const args = [

                "--url",
                url,

                "-H",
                "accept: */*",

                "-H",
                "accept-language: vi,en;q=0.8",

                "-H",
                "origin: https://scratch.mit.edu",

                "-H",
                "referer: https://scratch.mit.edu/",

                "-H",
                "user-agent: Mozilla/5.0"
            ];

            // ==================================
            // X-TOKEN
            // ==================================

            if (account.xToken) {

                args.push(
                    "-H",
                    `x-token: ${account.xToken}`
                );
            }

            // ==================================
            // SESSION
            // ==================================

            if (account.sessionId) {

                args.push(
                    "-H",
                    `cookie: scratchsessionsid=${account.sessionId}`
                );
            }

            // ==================================
            // CURL
            // ==================================

            execFile(
                "curl",
                args,
                {
                    maxBuffer:
                        10 * 1024 * 1024
                },
                (
                    error,
                    stdout,
                    stderr
                ) => {

                    if (error) {

                        console.log(
                            "curl error:",
                            error.message
                        );

                        console.log(
                            "stderr:",
                            stderr
                        );

                        reject(error);

                        return;
                    }

                    try {

                        const data =
                            JSON.parse(
                                stdout
                            );

                        resolve(data);

                    } catch (err) {

                        console.log(
                            "Scratch response:"
                        );

                        console.log(
                            stdout.slice(
                                0,
                                1000
                            )
                        );

                        reject(
                            new Error(
                                "INVALID_JSON"
                            )
                        );
                    }
                }
            );
        }
    );
}

// ==========================================
// SEND NOTIFICATIONS
// ==========================================

function sendNotifications(
    account,
    data
) {

    console.log(
        `========== ${account.username} NOTIFICATIONS ==========`
    );

    console.dir(
        data,
        {
            depth: null
        }
    );

    console.log(
        "========================================================"
    );

    io.emit(
        "notification",
        {
            username:
                account.username,

            notification:
                data
        }
    );
}

// ==========================================
// CHECK ACCOUNT
// ==========================================

async function checkAccount(
    account
) {

    console.log(
        `\n========== CHECK ${account.username} ==========`
    );

    console.log(
        "Session:",
        account.sessionId
            ? "CÓ"
            : "KHÔNG"
    );

    // =====================================
    // KHÔNG CÓ SESSION
    // =====================================

    if (!account.sessionId) {

        console.log(
            `[${account.username}] Không có session → login`
        );

        const success =
            await loginAccount(
                account
            );

        if (!success) {

            return;
        }
    }

    // =====================================
    // CÓ SESSION
    // =====================================

    console.log(
        `[${account.username}] Đang dùng session...`
    );

    setStatus(
        account,
        "checking_session"
    );

    try {

        const notifications =
            await getNotifications(
                account
            );

        console.log(
            `[${account.username}] Session OK`
        );

        console.log(
            `[${account.username}] Số notification:`,
            Array.isArray(
                notifications
            )
                ? notifications.length
                : "unknown"
        );

        setStatus(
            account,
            "online"
        );

        sendNotifications(
            account,
            notifications
        );

    } catch (error) {

        console.log(
            `[${account.username}] Error:`,
            error.message
        );

        // =================================
        // SESSION / AUTH LỖI
        // =================================

        if (
            error.message ===
                "SESSION_INVALID" ||

            error.message ===
                "AUTH_NO_XTOKEN" ||

            error.message ===
                "NO_SESSION"
        ) {

            console.log(
                `[${account.username}] Authentication lỗi → đăng nhập lại`
            );

            account.sessionId =
                null;

            account.xToken =
                null;

            deleteSession(
                account.username
            );

            setStatus(
                account,
                "session_expired"
            );

            await loginAccount(
                account
            );

            return;
        }

        // =================================
        // LỖI KHÁC
        // =================================

        setStatus(
            account,
            "online"
        );

        console.log(
            `[${account.username}] Giữ session vì lỗi không phải authentication`
        );
    }
}

// ==========================================
// CHECK ALL ACCOUNTS
// ==========================================

let checking = false;

async function checkAllAccounts() {

    if (checking) {

        return;
    }

    checking = true;

    try {

        for (
            const account
            of accounts
        ) {

            await checkAccount(
                account
            );

            // Nghỉ giữa các tài khoản
            await sleep(
                2000
            );
        }

    } catch (error) {

        console.error(
            "checkAllAccounts:",
            error
        );

    } finally {

        checking = false;
    }
}

// ==========================================
// SLEEP
// ==========================================

function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}

// ==========================================
// SOCKET.IO
// ==========================================

io.on(
    "connection",
    socket => {

        console.log(
            "Website connected"
        );

        // ==================================
        // WEBSITE YÊU CẦU UPDATE
        // ==================================

        socket.on(
            "updateNow",
            async () => {

                console.log(
                    "Website yêu cầu cập nhật notification"
                );

                for (
                    const account
                    of accounts
                ) {

                    try {

                        console.log(
                            `[${account.username}] Đang cập nhật...`
                        );

                        // ==================================
                        // NẾU CHƯA CÓ SESSION
                        // ==================================

                        if (
                            !account.sessionId
                        ) {

                            const success =
                                await loginAccount(
                                    account
                                );

                            if (!success) {

                                socket.emit(
                                    "notificationError",
                                    {
                                        username:
                                            account.username,

                                        error:
                                            "LOGIN_FAILED"
                                    }
                                );

                                continue;
                            }
                        }

                        // ==================================
                        // LẤY NOTIFICATION
                        // ==================================

                        const messages =
                            await getNotifications(
                                account
                            );

                        console.log(
                            `[${account.username}] Nhận được ${
                                Array.isArray(
                                    messages
                                )
                                    ? messages.length
                                    : 0
                            } messages`
                        );

                        socket.emit(
                            "notification",
                            {
                                username:
                                    account.username,

                                notifications:
                                    messages
                            }
                        );

                    } catch (error) {

                        console.error(
                            `[${account.username}]`,
                            error.message
                        );

                        socket.emit(
                            "notificationError",
                            {
                                username:
                                    account.username,

                                error:
                                    error.message
                            }
                        );
                    }
                }
            }
        );
    }
);

// ==========================================
// START SERVER
// ==========================================

server.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "================================="
        );

        console.log(
            " Scratch Notification Server"
        );

        console.log(
            "================================="
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log("");
    }
);