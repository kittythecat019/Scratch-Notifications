const socket = io();

const accountsElement =
    document.getElementById("accounts");

const notificationsElement =
    document.getElementById("notifications");


// ==========================================
// DATA
// ==========================================

const accountData = {};

let currentAccount = null;


// ==========================================
// STATUS
// ==========================================

function statusText(status) {

    switch (status) {

        case "online":
            return "🟢 Online";

        case "starting":
            return "🟡 Starting";

        case "logging_in":
            return "🟡 Đang đăng nhập";

        case "checking_session":
            return "🟡 Đang kiểm tra";

        case "login_required":
            return "🔴 Cần đăng nhập";

        case "session_expired":
            return "🔴 Session hết hạn";

        case "login_error":
            return "❌ Login lỗi";

        default:
            return "⚪ " + status;
    }
}


// ==========================================
// CREATE TAB
// ==========================================

function createTab(account) {

    const tab =
        document.createElement("button");

    tab.className =
        "account-tab";

    tab.dataset.username =
        account.username;

    tab.innerHTML = `
        <strong>${account.username}</strong>
        <span>
            ${statusText(account.status)}
        </span>
    `;

    tab.onclick = () => {

        selectAccount(
            account.username
        );
    };

    accountsElement.appendChild(tab);
}


// ==========================================
// CREATE ACCOUNT
// ==========================================

function createAccount(account) {

    accountData[
        account.username
    ] = {

        username:
            account.username,

        status:
            account.status,

        notifications:
            []
    };

    createTab(account);
}


// ==========================================
// SELECT ACCOUNT
// ==========================================

function selectAccount(username) {

    currentAccount =
        username;


    // ======================================
    // TAB ACTIVE
    // ======================================

    const tabs =
        document.querySelectorAll(
            ".account-tab"
        );

    tabs.forEach(tab => {

        if (
            tab.dataset.username ===
            username
        ) {

            tab.classList.add(
                "active"
            );

        } else {

            tab.classList.remove(
                "active"
            );
        }
    });


    renderNotifications();
}


// ==========================================
// RENDER NOTIFICATIONS
// ==========================================

function renderNotifications() {

    notificationsElement.innerHTML =
        "";


    if (!currentAccount) {

        notificationsElement.innerHTML =
            "<p>Chọn một tài khoản</p>";

        return;
    }


    const account =
        accountData[
            currentAccount
        ];


    if (!account) {

        return;
    }


    // ======================================
    // TITLE
    // ======================================

    const title =
        document.createElement(
            "h2"
        );

    title.textContent =
        account.username;

    notificationsElement.appendChild(
        title
    );


    // ======================================
    // STATUS
    // ======================================

    const status =
        document.createElement(
            "div"
        );

    status.className =
        "current-status";

    status.textContent =
        statusText(
            account.status
        );

    notificationsElement.appendChild(
        status
    );


    // ======================================
    // NOTIFICATIONS
    // ======================================

    if (
        account.notifications.length ===
        0
    ) {

        const empty =
            document.createElement(
                "p"
            );

        empty.textContent =
            "Chưa có thông báo";

        notificationsElement.appendChild(
            empty
        );

        return;
    }


    for (
        const notification
        of account.notifications
    ) {

        const element =
            document.createElement(
                "div"
            );

        element.className =
            "notification";


        if (
            typeof notification ===
            "object"
        ) {

            element.textContent =
                JSON.stringify(
                    notification
                );

        } else {

            element.textContent =
                notification;
        }


        notificationsElement.appendChild(
            element
        );
    }
}


// ==========================================
// ACCOUNTS
// ==========================================

socket.on(
    "accounts",
    accounts => {

        accountsElement.innerHTML =
            "";

        notificationsElement.innerHTML =
            "";

        // reset
        for (
            const key
            of Object.keys(accountData)
        ) {

            delete accountData[key];
        }


        for (
            const account
            of accounts
        ) {

            createAccount(
                account
            );
        }


        // Chọn tài khoản đầu tiên
        if (
            accounts.length > 0
        ) {

            selectAccount(
                accounts[0].username
            );
        }
    }
);


// ==========================================
// ACCOUNT STATUS
// ==========================================

socket.on(
    "accountStatus",
    data => {

        console.log(
            data.username,
            data.status
        );


        const account =
            accountData[
                data.username
            ];


        if (!account) {

            return;
        }


        account.status =
            data.status;


        // cập nhật tab
        const tab =
            document.querySelector(
                `.account-tab[data-username="${CSS.escape(data.username)}"]`
            );


        if (tab) {

            const span =
                tab.querySelector(
                    "span"
                );

            span.textContent =
                statusText(
                    data.status
                );
        }


        if (
            currentAccount ===
            data.username
        ) {

            renderNotifications();
        }
    }
);


// ==========================================
// NOTIFICATION
// ==========================================

socket.on(
    "notification",
    data => {

        console.log(
            "Notification:",
            data
        );


        // Nếu account chưa tồn tại
        if (
            !accountData[
                data.username
            ]
        ) {

            createAccount({

                username:
                    data.username,

                status:
                    "online"
            });
        }


        const account =
            accountData[
                data.username
            ];


        let notifications =
            data.notifications;


        if (
            !Array.isArray(
                notifications
            )
        ) {

            notifications =
                data.notification;
        }


        if (
            !Array.isArray(
                notifications
            )
        ) {

            notifications = [
                notifications
            ];
        }


        // Lưu notification
        account.notifications =
            notifications;


        // Chỉ render account đang mở
        if (
            currentAccount ===
            data.username
        ) {

            renderNotifications();
        }
    }
);


// ==========================================
// ERROR
// ==========================================

socket.on(
    "notificationError",
    data => {

        console.error(
            data.username,
            data.error
        );
    }
);