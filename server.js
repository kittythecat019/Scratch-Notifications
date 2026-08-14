require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const Scratch = require("scratch-api");
const { Server } = require("socket.io");
const { execFile } = require("child_process");


// ==========================================
// PYTHON / UV
// ==========================================

const PYTHON =
    process.platform === "win32"
        ? "python"
        : "python3";

const UV_PATHS = [
    "/usr/local/bin/uv",
    "/usr/bin/uv",
    "/root/.local/bin/uv",
    "/usr/local/sbin/uv"
];

let UV_PATH = null;


// Tìm uv
for (const possiblePath of UV_PATHS) {

    if (fs.existsSync(possiblePath)) {

        UV_PATH = possiblePath;

        break;
    }
}


// Hiển thị thông tin
console.log(
    "================================="
);

console.log(
    "Python:",
    PYTHON
);

console.log(
    "UV:",
    UV_PATH || "KHÔNG TÌM THẤY"
);

console.log(
    "================================="
);


// Thêm thư mục chứa uv vào PATH
if (UV_PATH) {

    const uvDirectory =
        path.dirname(UV_PATH);

    process.env.PATH =
        uvDirectory +
        ":" +
        (process.env.PATH || "");
}


// ==========================================
// SERVER
// ==========================================

const app = express();

const server =
    http.createServer(app);

const io =
    new Server(server);

const PORT =
    process.env.PORT || 3000;


// ==========================================
// STATIC FILES
// ==========================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);


// ==========================================
// SESSION FOLDER
// ==========================================

const SESSION_DIR =
    path.join(
        __dirname,
        "sessions"
    );


if (
    !fs.existsSync(
        SESSION_DIR
    )
) {

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

function getSessionFile(
    username
) {

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

function loadSession(
    username
) {

    const file =
        getSessionFile(
            username
        );


    if (
        !fs.existsSync(file)
    ) {

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


        return (
            data.sessionId ||
            null
        );

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
        getSessionFile(
            username
        );


    fs.writeFileSync(
        file,
        JSON.stringify(
            {
                username,
                sessionId,
                savedAt:
                    Date.now()
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

function deleteSession(
    username
) {

    const file =
        getSessionFile(
            username
        );


    if (
        fs.existsSync(file)
    ) {

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


for (
    let i = 1;
    ;
    i++
) {

    const username =
        process.env[
            `SCRATCH_USER_${i}`
        ];


    const password =
        process.env[
            `SCRATCH_PASS_${i}`
        ];


    /*
     * Không còn account
     */

    if (
        !username &&
        !password
    ) {

        break;

    }


    /*
     * Thiếu username/password
     */

    if (
        !username ||
        !password
    ) {

        console.log(
            `Account ${i} thiếu username hoặc password`
        );

        continue;

    }


    const savedSession =
        loadSession(
            username
        );


    accounts.push({

        username,

        password,

        sessionId:
            savedSession,

        /*
         * X-Token lấy bằng auth.py
         */

        xToken:
            null,

        status:
            savedSession
                ? "session_loaded"
                : "login_required",

        notifications:
            []

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
        (
            resolve,
            reject
        ) => {

            console.log(
                `[${username}] Đang đăng nhập bằng password...`
            );


            Scratch.UserSession.create(
                username,
                password,
                (
                    err,
                    user
                ) => {

                    if (err) {

                        console.log(
                            `[${username}] FULL LOGIN ERROR:`,
                            err
                        );

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


                    if (
                        !user.sessionId
                    ) {

                        reject(
                            new Error(
                                "Không nhận được sessionId"
                            )
                        );

                        return;

                    }


                    console.log(
                        `[${username}] LOGIN OK`
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
// RUN AUTH.PY
// ==========================================

function getAuthFromPython(
    sessionId,
    username
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const authPath =
                path.join(
                    __dirname,
                    "auth.py"
                );


            if (
                !fs.existsSync(
                    authPath
                )
            ) {

                reject(
                    new Error(
                        "Không tìm thấy auth.py"
                    )
                );

                return;

            }


            console.log(
                `[${username}] Chạy auth.py...`
            );


            console.log(
                `[${username}] Python:`,
                PYTHON
            );


            console.log(
                `[${username}] UV:`,
                UV_PATH ||
                    "KHÔNG TÌM THẤY"
            );


            /*
             * Environment cho Python
             */

            const pythonEnv = {

                ...process.env,

                PATH:
                    process.env.PATH ||
                    ""

            };


            /*
             * Đảm bảo thư mục uv
             * nằm trong PATH
             */

            if (UV_PATH) {

                const uvDirectory =
                    path.dirname(
                        UV_PATH
                    );


                pythonEnv.PATH =
                    uvDirectory +
                    ":" +
                    pythonEnv.PATH;

            }


            execFile(
                PYTHON,

                [
                    authPath,
                    sessionId,
                    username
                ],

                {
                    maxBuffer:
                        1024 * 1024,

                    env:
                        pythonEnv
                },

                (
                    error,
                    stdout,
                    stderr
                ) => {

                    if (error) {

                        console.log(
                            `[${username}] auth.py lỗi:`,
                            error.message
                        );


                        if (stderr) {

                            console.log(
                                `[${username}] auth.py stderr:`,
                                stderr
                            );

                        }


                        if (stdout) {

                            console.log(
                                `[${username}] auth.py stdout:`,
                                stdout
                            );

                        }


                        reject(error);

                        return;

                    }


                    const output =
                        stdout.trim();


                    console.log(
                        `[${username}] auth.py output:`,
                        output
                    );


                    try {

                        const result =
                            JSON.parse(
                                output
                            );


                        if (
                            result.error
                        ) {

                            reject(
                                new Error(
                                    result.error
                                )
                            );

                            return;

                        }


                        if (
                            !result.xToken
                        ) {

                            reject(
                                new Error(
                                    "auth.py không trả về X-Token"
                                )
                            );

                            return;

                        }


                        resolve(
                            result
                        );

                    } catch (error) {

                        reject(
                            new Error(
                                "auth.py trả về JSON không hợp lệ"
                            )
                        );

                    }

                }
            );

        }
    );

}


// ==========================================
// REFRESH X-TOKEN
// ==========================================

async function refreshXToken(
    account
) {

    if (
        !account.sessionId
    ) {

        throw new Error(
            "Không có sessionId"
        );

    }


    console.log(
        `[${account.username}] Đang lấy X-Token bằng scratchattach...`
    );


    const result =
        await getAuthFromPython(
            account.sessionId,
            account.username
        );


    /*
     * Kiểm tra username
     */

    if (
        result.username &&
        result.username !==
            account.username
    ) {

        throw new Error(
            "Session không thuộc tài khoản này"
        );

    }


    /*
     * Lưu X-Token
     */

    account.xToken =
        result.xToken;


    /*
     * Nếu Python trả sessionId mới
     */

    if (
        result.sessionId &&
        result.sessionId !==
            account.sessionId
    ) {

        account.sessionId =
            result.sessionId;


        saveSession(
            account.username,
            account.sessionId
        );

    }


    console.log(
        `[${account.username}] X-Token đã lấy thành công`
    );


    return result;

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

        /*
         * Login bằng username/password
         */

        const sessionId =
            await loginWithPassword(
                account.username,
                account.password
            );


        /*
         * Lưu session
         */

        account.sessionId =
            sessionId;


        saveSession(
            account.username,
            sessionId
        );


        /*
         * Lấy X-Token
         */

        account.xToken =
            null;


        await refreshXToken(
            account
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
// GET NOTIFICATIONS
// ==========================================

function getNotifications(
    account
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            if (
                !account.sessionId
            ) {

                reject(
                    new Error(
                        "SESSION_INVALID"
                    )
                );

                return;

            }


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


            /*
             * X-Token
             */

            if (
                account.xToken
            ) {

                args.push(
                    "-H",
                    `x-token: ${account.xToken}`
                );

            }


            /*
             * Session cookie
             */

            args.push(
                "-H",
                `cookie: scratchsessionsid=${account.sessionId}`
            );


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
                            `[${account.username}] curl error:`,
                            error.message
                        );


                        if (stderr) {

                            console.log(
                                stderr
                            );

                        }


                        reject(error);

                        return;

                    }


                    const text =
                        stdout.trim();


                    /*
                     * HTML/XML
                     */

                    if (
                        text.startsWith("<")
                    ) {

                        console.log(
                            `[${account.username}] Scratch trả HTML/XML`
                        );


                        reject(
                            new Error(
                                "SESSION_INVALID"
                            )
                        );

                        return;

                    }


                    try {

                        const data =
                            JSON.parse(
                                text
                            );


                        /*
                         * API error
                         */

                        if (
                            data &&
                            data.status &&
                            Number(
                                data.status
                            ) >= 400
                        ) {

                            reject(
                                new Error(
                                    "SESSION_INVALID"
                                )
                            );

                            return;

                        }


                        resolve(
                            data
                        );

                    } catch (error) {

                        console.log(
                            `[${account.username}] JSON lỗi`
                        );


                        console.log(
                            text.slice(
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

    account.notifications =
        Array.isArray(data)
            ? data
            : [];


    io.emit(
        "notification",
        {
            username:
                account.username,

            notifications:
                account.notifications
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
        `[${account.username}] Session:`,
        account.sessionId
            ? "CÓ"
            : "KHÔNG"
    );


    console.log(
        `[${account.username}] X-Token:`,
        account.xToken
            ? "CÓ"
            : "KHÔNG"
    );


    /*
     * Không có session
     */

    if (
        !account.sessionId
    ) {

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


    /*
     * Có session nhưng chưa có X-Token
     */

    if (
        !account.xToken
    ) {

        try {

            await refreshXToken(
                account
            );

        } catch (error) {

            console.log(
                `[${account.username}] Không lấy được X-Token:`,
                error.message
            );


            /*
             * Session không dùng được
             */

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


            /*
             * Login lại
             */

            const success =
                await loginAccount(
                    account
                );


            if (!success) {

                return;

            }

        }

    }


    /*
     * Không có auth
     */

    if (
        !account.sessionId ||
        !account.xToken
    ) {

        return;

    }


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


        /*
         * Session hết hạn
         */

        if (
            error.message ===
            "SESSION_INVALID"
        ) {

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


        /*
         * Lỗi API khác
         */

        console.log(
            `[${account.username}] Giữ session vì lỗi API`
        );

    }

}


// ==========================================
// CHECK ALL ACCOUNTS
// ==========================================

let checking =
    false;


async function checkAllAccounts() {

    if (
        checking
    ) {

        return;

    }


    checking =
        true;


    try {

        for (
            const account
            of accounts
        ) {

            await checkAccount(
                account
            );


            /*
             * Nghỉ giữa các tài khoản
             */

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

        checking =
            false;

    }

}


// ==========================================
// SLEEP
// ==========================================

function sleep(
    ms
) {

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


        /*
         * Gửi danh sách tài khoản
         */

        socket.emit(
            "accounts",
            accounts.map(
                account => ({

                    username:
                        account.username,

                    status:
                        account.status

                })
            )
        );


        /*
         * Website yêu cầu cập nhật
         */

        socket.on(
            "updateNow",
            async () => {

                console.log(
                    "Website yêu cầu cập nhật notification"
                );


                await checkAllAccounts();

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
            `Port: ${PORT}`
        );

        console.log(
            `Accounts: ${accounts.length}`
        );

        console.log("");

    }
);
