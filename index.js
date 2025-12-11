require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6t2ckxo.mongodb.net/?appName=Cluster0`;

const admin = require('firebase-admin')
const port = process.env.PORT || 3000
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const app = express()
// middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://b12-m11-session.web.app',
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
)
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log(token)
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    
    // await client.connect();
    const db=client.db('Local_db')
     const mealCollections=db.collection('meals')
    const orderCollection=db.collection('order')
    const mealCollection=db.collection('meal')

    // order here
    app.post('/order',async(req,res)=>{
      const orderData=req.body;
      const result=await orderCollection.insertOne(orderData)
      res.send(orderData)
    })

  // meals here
   app.post('/meals',async(req,res)=>{
      const mealData=req.body;
      const result=await mealCollections.insertOne(mealData)
      res.send(result)
    })

    app.get('/meals',async(req,res)=>{
      const result=await mealCollections.find().toArray()
      res.send(result)
    })
    app.get('/meals/:id',async(req,res)=>{
      const id=req.params.id;
      const result=await mealCollections.findOne({_id: new ObjectId(id) })
      res.send(result)
    })
   
// meal here
    app.get('/meal',async(req,res)=>{
        const result=await mealCollection.find().toArray()
        res.send(result)
    })
    app.get('/meal/:id',async(req,res)=>{
      const id=req.params.id;
      const result=await mealCollection.findOne({_id: new ObjectId(id)})
      res.send(result)
    })
   
    
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
   
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
