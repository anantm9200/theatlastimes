// Run with mongosh inside the dedicated MongoDB container. Secrets stay in its
// environment; never interpolate passwords into terminal command arguments.
const uri = `mongodb://${encodeURIComponent(process.env.MONGO_INITDB_ROOT_USERNAME)}:${encodeURIComponent(process.env.MONGO_INITDB_ROOT_PASSWORD)}@127.0.0.1:27019/admin?directConnection=true`;
const connection = new Mongo(uri);
const admin = connection.getDB("admin");
try { admin.runCommand({ replSetGetStatus: 1 }); }
catch (error) {
  if (error.code !== 94) throw error;
  const result = admin.runCommand({ replSetInitiate: { _id: "atlasLocal", members: [{ _id: 0, host: "127.0.0.1:27019" }] } });
  if (result.ok !== 1) throw new Error("Could not initialize the replica set");
}
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  if (admin.runCommand({ hello: 1 }).isWritablePrimary) { ready = true; break; }
  sleep(1000);
}
if (!ready) throw new Error("MongoDB did not become primary");
const name = process.env.MONGODB_DB_NAME || "the_atlas_times", database = connection.getDB(name);
if (!database.getUser(process.env.MONGO_APP_USER)) database.createUser({ user: process.env.MONGO_APP_USER, pwd: process.env.MONGO_APP_PASSWORD, roles: [{ role: "readWrite", db: name }] });
print("Local replica set and application user are ready");
