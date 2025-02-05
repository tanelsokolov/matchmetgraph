package graphql

import (
	"database/sql"

	"github.com/graphql-go/graphql"
)

func NewSchema(db *sql.DB) (graphql.Schema, error) {
	resolver := NewResolver(db)

	rootQuery := graphql.NewObject(graphql.ObjectConfig{
		Name: "RootQuery",
		Fields: graphql.Fields{
			"user": &graphql.Field{
				Type: userType,
				Args: graphql.FieldConfigArgument{
					"id": &graphql.ArgumentConfig{Type: graphql.Int},
				},
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					id := p.Args["id"].(int)
					return resolver.getUserById(id)
				},
			},
			"me": &graphql.Field{
				Type: userType,
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					// Get user ID from context
					userID := p.Context.Value("user_id").(int)
					return resolver.getUserById(userID)
				},
			},
			"recommendations": &graphql.Field{
				Type: graphql.NewList(userType),
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					userID := p.Context.Value("user_id").(int)
					return resolver.getRecommendations(userID)
				},
			},
			"connections": &graphql.Field{
				Type: graphql.NewList(userType),
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					userID := p.Context.Value("user_id").(int)
					return resolver.getConnections(userID)
				},
			},
		},
	})

	return graphql.NewSchema(graphql.SchemaConfig{
		Query: rootQuery,
	})
}
