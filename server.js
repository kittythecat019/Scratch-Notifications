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

const server =
    http.createServer(app);

const io =
    new Server(server);

const PORT =
    process.env.PORT || 3000;


// ==========================================
// STATIC
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
     * Nếu không còn account
     */

    if (
        !username &&
        !password
    ) {

        break;

    }


    /*
     * Account thiếu dữ liệu
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


    /*
     * Thử load session cũ
     */

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
         * X-Token không lưu trong .env.
         * auth.py sẽ lấy tự động.
         */

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
                        `[${username}] LOGIN OK!`
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
// PYTHON AUTH
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


            /*
             * Render/Linux:
             * python
             *
             * Nếu máy local chỉ có python3
             * thì có thể đổi thành python3.
             */

            execFile(
                "python",
                [
                    authPath,
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
                            `[${username}] auth.py lỗi:`
                        );

                        console.log(
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


                    try {

                        const result =
                            JSON.parse(
                                stdout
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

                    } catch (err) {

                        console.log(
                            `[${username}] auth.py trả về dữ liệu không hợp lệ:`
                        );

                        console.log(
                            stdout
                        );

                        reject(err);

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
            "Không có Scratch session"
        );

    }


    console.log(
        `[${account.username}] Đang lấy X-Token bằng scratchattach...`
    );


    const auth =
        await getAuthFromPython(
            account.sessionId,
            account.username
        );


    account.xToken =
        auth.xToken;


    /*
     * Nếu scratchattach trả session mới
     * thì cập nhật luôn.
     */

    if (
        auth.sessionId &&
        auth.sessionId !==
            account.sessionId
    ) {

        account.sessionId =
            auth.sessionId;


        saveSession(
            account.username,
            account.sessionId
        );

    }


    console.log(
        `[${account.username}] X-Token đã lấy thành công`
    );


    return auth;

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
         * Đăng nhập
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
         * Reset X-Token
         */

        account.xToken =
            null;


        /*
         * Lấy X-Token
         */

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
             * Session
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


                        reject(error);

                        return;

                    }


                    /*
                     * Kiểm tra response
                     */

                    const text =
                        stdout.trim();


                    /*
                     * Scratch trả HTML/XML
                     * thường là session/token lỗi.
                     */

                    if (
                        text.startsWith("<")
                    ) {

                        console.log(
                            `[${account.username}] Scratch trả về HTML/XML`
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
                         * Một số lỗi API
                         */

                        if (
                            data &&
                            data.status &&
                            data.status >= 400
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

                    } catch (err) {

                        console.log(
                            `[${account.username}] Scratch response:`
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

    io.emit(
        "notification",
        {
            username:
                account.username,

            notifications:
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
     * Nếu chưa có X-Token
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
                `[${account.username}] Session không dùng được:`,
                error.message
            );


            /*
             * Xóa session cũ
             */

            account.sessionId =
                null;

            account.xToken =
                null;


            deleteSession(
                account.username
            );


            /*
             * Login lại
             */

            await loginAccount(
                account
            );

        }

    }


    /*
     * Nếu login vẫn thất bại
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
         * Session invalid
         */

        if (
            error.message ===
            "SESSION_INVALID"
        ) {

            console.log(
                `[${account.username}] Session hết hạn → login lại`
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


        /*
         * Lỗi khác
         */

        console.log(
            `[${account.username}] Giữ session vì lỗi không phải authentication`
        );

    }

}


// ==========================================
// CHECK ALL
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
         * Gửi danh sách account
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
// STARTUP
// ==========================================

/*
 * Chỉ check sau khi server đã listen.
 */

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

        console.log("");

    }
);
