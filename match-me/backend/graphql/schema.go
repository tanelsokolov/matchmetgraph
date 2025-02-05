package graphql

import (
	"github.com/graphql-go/graphql"
)

// Define types
var userType = graphql.NewObject(graphql.ObjectConfig{
	Name: "User",
	Fields: graphql.Fields{
		"id":                &graphql.Field{Type: graphql.Int},
		"name":              &graphql.Field{Type: graphql.String},
		"email":             &graphql.Field{Type: graphql.String},
		"profilePictureUrl": &graphql.Field{Type: graphql.String},
		"bio": &graphql.Field{
			Type: bioType,
			Resolve: func(p graphql.ResolveParams) (interface{}, error) {
				user := p.Source.(map[string]interface{})
				return getBioForUser(user["id"].(int))
			},
		},
		"profile": &graphql.Field{
			Type: profileType,
			Resolve: func(p graphql.ResolveParams) (interface{}, error) {
				user := p.Source.(map[string]interface{})
				return getProfileForUser(user["id"].(int))
			},
		},
	},
})

var bioType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Bio",
	Fields: graphql.Fields{
		"id":       &graphql.Field{Type: graphql.Int},
		"age":      &graphql.Field{Type: graphql.Int},
		"location": &graphql.Field{Type: graphql.String},
		"user": &graphql.Field{
			Type: userType,
			Resolve: func(p graphql.ResolveParams) (interface{}, error) {
				bio := p.Source.(map[string]interface{})
				return getUserById(bio["user_id"].(int))
			},
		},
	},
})

var profileType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Profile",
	Fields: graphql.Fields{
		"id":         &graphql.Field{Type: graphql.Int},
		"bio":        &graphql.Field{Type: graphql.String},
		"interests":  &graphql.Field{Type: graphql.NewList(graphql.String)},
		"lookingFor": &graphql.Field{Type: graphql.String},
		"occupation": &graphql.Field{Type: graphql.String},
		"user": &graphql.Field{
			Type: userType,
			Resolve: func(p graphql.ResolveParams) (interface{}, error) {
				profile := p.Source.(map[string]interface{})
				return getUserById(profile["user_id"].(int))
			},
		},
	},
})
