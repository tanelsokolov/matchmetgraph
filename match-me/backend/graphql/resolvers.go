package graphql

import (
	"database/sql"
)

type Resolver struct {
	db *sql.DB
}

func NewResolver(db *sql.DB) *Resolver {
	return &Resolver{db: db}
}

func (r *Resolver) getUserById(id int) (map[string]interface{}, error) {
	var user map[string]interface{}
	err := r.db.QueryRow(`
        SELECT u.id, u.email, COALESCE(p.name, '') as name, COALESCE(p.profile_picture_url, '') as profile_picture_url
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.id = $1
    `, id).Scan(&user["id"], &user["email"], &user["name"], &user["profilePictureUrl"])
	return user, err
}

func (r *Resolver) getBioForUser(userId int) (map[string]interface{}, error) {
	var bio map[string]interface{}
	err := r.db.QueryRow(`
        SELECT user_id, age, location
        FROM profiles
        WHERE user_id = $1
    `, userId).Scan(&bio["user_id"], &bio["age"], &bio["location"])
	return bio, err
}

func (r *Resolver) getProfileForUser(userId int) (map[string]interface{}, error) {
	var profile map[string]interface{}
	err := r.db.QueryRow(`
        SELECT user_id, bio, interests, looking_for, occupation
        FROM profiles
        WHERE user_id = $1
    `, userId).Scan(&profile["user_id"], &profile["bio"], &profile["interests"],
		&profile["lookingFor"], &profile["occupation"])
	return profile, err
}
