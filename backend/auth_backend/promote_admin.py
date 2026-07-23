from pathlib import Path
import sqlite3
import sys

BASE_DIR = Path(__file__).resolve().parent
DB_NAME = BASE_DIR / "synestra.db"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def main():
    if len(sys.argv) != 2:
        print("Usage: python promote_admin.py admin@example.com")
        raise SystemExit(1)

    email = normalize_email(sys.argv[1])

    if not email:
        print("Email is required.")
        raise SystemExit(1)

    connection = sqlite3.connect(DB_NAME)
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()

    user = cursor.execute(
        "SELECT id, email, role FROM users WHERE LOWER(email) = ?",
        (email,),
    ).fetchone()

    if not user:
        connection.close()
        print(
            "User not found. Register the account first, then run this "
            "command again."
        )
        raise SystemExit(1)

    cursor.execute(
        """
        UPDATE users
        SET role = 'admin',
            token_version = token_version + 1
        WHERE id = ?
        """,
        (user["id"],),
    )

    connection.commit()
    connection.close()

    print(f"Admin access granted to: {user['email']}")
    print("Previous sessions were invalidated. Log in again through /admin/login.")


if __name__ == "__main__":
    main()