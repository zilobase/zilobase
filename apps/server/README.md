# Notelab Server

```sh
npm install
npm run db:migrate
npm run dev
```

`npm run dev` starts the normal Node/serverful backend on port `3000`.

## Deployment Adapters

Cloudflare deployment support lives in the private
`@notelab-io/cloudflare-adapter` package. The open-source server exports its
adapter integration surface from `@notelab/server/adapter-api`, so the public
repo can install and run without GitHub Packages credentials.
