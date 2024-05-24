const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const amqp = require('amqplib/callback_api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const RABBITMQ_URL = 'amqp://localhost';
const EXCHANGE_NAME = 'chat_exchange';

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

amqp.connect(RABBITMQ_URL, (err, connection) => {
  if (err) {
    throw err;
  }

  connection.createChannel((err, channel) => {
    if (err) {
      throw err;
    }

    channel.assertExchange(EXCHANGE_NAME, 'direct', {
      durable: true
    });

    io.on('connection', (socket) => {
      socket.id = 'ayush'
      console.log('New client connected:', socket.id);

      // Generate a unique queue for the user
      const userQueue = `queue_${socket.id}`;
      channel.assertQueue(userQueue, { durable: true });
      channel.bindQueue(userQueue, EXCHANGE_NAME, userQueue);

      // Start consuming messages for this user
      channel.consume(userQueue, (msg) => {
        if(msg!=null){
          const receivedMessage = JSON.parse(msg.content.toString());
        console.log(`Received message for ${socket.id}: ${receivedMessage.text}`);

        // Emit the message to the specific user
        socket.emit('chat message', receivedMessage);
        channel.ack(msg);

        }
        
      }, {
        noAck: false
      });

      // Handle incoming chat messages
      socket.on('chat message', (msg) => {
        const { text, recipient } = msg;

        // Construct the message object with sender and text
        const message = JSON.stringify({ sender: socket.id, text });
        const recipientQueues = [`queue_${socket.id}`, `queue_${recipient}`];
        channel.publish(EXCHANGE_NAME,`queue_${recipient}`, Buffer.from(message));
        channel.publish(EXCHANGE_NAME,`queue_${socket.id}`,Buffer.from(message));
        console.log(`Sent message from ${socket.id} to ${recipient}: ${text}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        channel.unbindQueue(userQueue, EXCHANGE_NAME, userQueue);
        channel.deleteQueue(userQueue);
      });
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
