require('dotenv').config()
const express = require('express')
const cors = require('cors')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
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
    const db = client.db('Local_db')
    const favoriteCollection=db.collection('favorite')
    const mealCollections = db.collection('meals')
    const orderCollection = db.collection('order')
    const paymentCollection = db.collection('payment')
    const usersCollection=db.collection('user')
    const mealCollection = db.collection('meal')

  //  favorite
app.post('/favorite', async (req, res) => {
  try {
    const favoriteData = req.body;

    // Check if this meal already exists for this user
    const existing = await favoriteCollection.findOne({
      email: favoriteData.email,
      mealId: favoriteData.mealId
    });

    if (existing) {
      return res.status(400).send({ msg: 'Meal already in favorites' });
    }

    // Insert new favorite
    const result = await favoriteCollection.insertOne(favoriteData);
    res.send({ msg: 'Favorite added successfully', data: result });
    
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to add favorite' });
  }
});
    app.get('/favorite/:email',async(req,res)=>{
      const email=req.params.email;
      const result= await favoriteCollection.find({email}).toArray()
      res.send(result)
    })

    app.delete('/favorite/:id',async(req,res)=>{
       try {
    const id = req.params.id; 
    const result = await favoriteCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      res.send({ msg: 'Favorite meal deleted successfully' });
    } else {
      res.status(404).send({ msg: 'Meal not found' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to delete favorite' });
  }
    })
    // user api
    app.post('/user',async(req,res)=>{
  const userData=req.body;
  userData.created_at= new Date().toISOString()
  userData.last_loggedIn= new Date().toISOString()
  userData.role='customer'
  userData.status='active'
   
  const query={
    email: userData.email

  }
  const alreadyExist=await usersCollection.findOne(query)
  console.log('User Already Exist ---->',!!alreadyExist)
  if(alreadyExist){
    console.log("update user Info")
    const   result= await usersCollection.updateOne(query,{
      $set:{
        last_loggedIn: new Date().toISOString(),
      },
    })
    return res.send(result)
  }
  console.log('Saving new user')
  const result=await usersCollection.insertOne(userData)
  
  res.send(result)
})


    // payment api 
    app.get('/payment',async(req,res)=>{
      const result=await paymentCollection.find().toArray()
      res.send(result)
    })

    app.get('/order-request/:email',async(req,res)=>{
      const email=req.params.email;
      const result=await paymentCollection.find({customer:email}).toArray()
      res.send(result)
    })

    // order here
    app.post('/order', async (req, res) => {
      const orderData = req.body;
      const result = await orderCollection.insertOne(orderData)
      res.send(orderData)
    })
    app.get('/my-order/:email', async (req, res) => {
      const email = req.params.email;
      const result = await orderCollection.find({ userEmail: email }).toArray()
      res.send(result)
    })

    // meals here
    app.post('/meals', async (req, res) => {
      const mealData = req.body;
      const result = await mealCollections.insertOne(mealData)
      res.send(result)
    })

    app.get('/meals', async (req, res) => {
      const result = await mealCollections.find().toArray()
      res.send(result)
    })
    app.get('/meals/:id', async (req, res) => {
      const id = req.params.id;
      const result = await mealCollections.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // meal here
    app.get('/meal', async (req, res) => {
      const result = await mealCollection.find().toArray()
      res.send(result)
    })
    app.get('/meal/:id', async (req, res) => {
      const id = req.params.id;
      const result = await mealCollection.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // payment
    app.post('/create-checkout-session', async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {

            price_data: {
              currency: 'usd',
              product_data: {
                name: paymentInfo?.mealName,
              },
              unit_amount: paymentInfo?.price * 100,
            },
            quantity: paymentInfo?.quantity,
          },
        ],
        customer_email: paymentInfo.customer.email,
        mode: 'payment',
        metadata: {
          orderId: paymentInfo?.orderId,
          customer: paymentInfo?.customer.email,

        },
        success_url: `http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `http://localhost:5173/dashboard/my-orders`
      });

      res.send({ url: session.url })
    });

    // app.post('/payment-success', async (req, res) => {
    //   const { sessionId } = req.body
    //   const session = await stripe.checkout.sessions.retrieve(sessionId);
    //   const order = await orderCollection.findOne({
    //     _id: new ObjectId(session.metadata.orderId)
    //   })
    //   const payment = await paymentCollection.findOne({ transactionId: session.payment_intent })
    //   if (session.status == 'complete' && order && !payment) {
    //     // save order data in db
    //     const orderInfo = {
    //       orderId: session.metadata.orderId,
    //       transactionId: session.payment_intent,
    //       customer:session.metadata.customer,
    //       status: 'pending',
    //       name: order.mealName,
    //       price: session.amount_total / 100,
    //       quantity: 1,
    //       orderTime: order.orderTime,
    //       paymentStatus: 'paid',
    //     }
    //     const result = await paymentCollection.insertOne(orderInfo)
    //   }
    //   res.send(order)
    // })
app.post('/payment-success', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send({ error: "sessionId missing" });
    }

    // Retrieve stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const orderId = session?.metadata?.orderId;
    const transactionId = session?.payment_intent;

    if (!orderId || !transactionId) {
      return res.status(400).send({ error: "Invalid metadata" });
    }

    const orderObjectId = new ObjectId(orderId);

    // Fetch order
    const order = await orderCollection.findOne({ _id: orderObjectId });
    if (!order) {
      return res.status(404).send({ error: "Order not found" });
    }

    // Check if this transaction already saved (prevents duplicate)
    const existingPayment = await paymentCollection.findOne({
      transactionId: transactionId
    });

    if (existingPayment) {
      console.log("⚠ Payment already exists → blocking duplicate");
      
      // Ensure order status is updated
      await orderCollection.updateOne(
        { _id: orderObjectId },
        { $set: { paymentStatus: "paid" } }
      );

      return res.send({ message: "Already processed", order });
    }

    // Build payment object
    const orderInfo = {
      orderId,
      transactionId,
      chefId:order.chefId,
      customer: session.metadata.customer,
      status: 'pending',
      name: order.mealName,
      price: session.amount_total / 100,
      quantity: 1,
      orderTime: order.orderTime,
      paymentStatus: 'paid',
      createdAt: new Date()
    };

    // Insert payment + handle duplicate error safely
    try {
      await paymentCollection.insertOne(orderInfo);
    } catch (err) {
      if (err.code === 11000) {
        console.log("⚠ Duplicate transaction prevented by unique index");
      } else {
        throw err;
      }
    }

    // Update order paymentStatus
    await orderCollection.updateOne(
      { _id: orderObjectId },
      { $set: { paymentStatus: "paid" } }
    );

    res.send({ message: "Payment confirmed", order });

  } catch (error) {
    console.error("Payment Success Error:", error);
    res.status(500).send({ error: "Something went wrong" });
  }
});







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
