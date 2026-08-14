import sys
import json
import scratchattach as sa


def get_auth(session_id, username):
    session = sa.login_by_id(
        session_id,
        username=username
    )

    return {
        "username": session.username,
        "sessionId": session.id,
        "xToken": session.xtoken
    }


if __name__ == "__main__":
    session_id = sys.argv[1]
    username = sys.argv[2]

    try:
        result = get_auth(
            session_id,
            username
        )

        print(
            json.dumps(
                result,
                ensure_ascii=False
            )
        )

    except Exception as error:

        print(
            json.dumps(
                {
                    "error": str(error)
                },
                ensure_ascii=False
            )
        )

        sys.exit(1)