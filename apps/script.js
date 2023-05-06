var chatbox = document.querySelector(".chatbox");
var input = document.querySelector(".input input");
var clear = document.querySelector(".input button:first-child");
var send = document.querySelector(".input button:last-child");

// Add event listeners
input.addEventListener("keyup", function(event) {
  // If the user presses enter
  if (event.keyCode === 13) {
    // Send the message
    sendMessage();
    // Clear the input field
    input.value = "";
    // Prevent the default action
    event.preventDefault();
  }
});

clear.addEventListener("click", function() {
  // Clear the chatbox
  chatbox.innerHTML = "";
});

send.addEventListener("click", function() {
  // Send the message
  sendMessage();
});

// Define a function to send a message
function sendMessage() {
  // Get the input value
  var message = input.value.trim();
  
   // If the message is not empty
   if (message) {
     // Create a paragraph element for the user message
     var userMessage = document.createElement("p");
     userMessage.textContent = "User: " + message;

     // Append the user message to the chatbox
     chatbox.appendChild(userMessage);

     // Scroll to the bottom of the chatbox
     chatbox.scrollTop = chatbox.scrollHeight;

     // Create a paragraph element for the AI message
     var aiMessage = document.createElement("p");
     aiMessage.textContent = "AI: I'm sorry, I can't reply right now.";

     // Append the AI message to the chatbox after a delay
     setTimeout(function() {
       chatbox.appendChild(aiMessage);

       // Scroll to the bottom of the chatbox
       chatbox.scrollTop = chatbox.scrollHeight;

       // Clear the input field
       input.value = "";
     }, 1000);
   }
}
// Add this to the script section or file
// Get the popup element
var popup = document.getElementById("popup");

// Define a function to show the popup
function showPopup() {
  // Set the display property to block
  popup.style.display = "block";

  // Set a timeout to hide the popup after 2 seconds
  setTimeout(function() {
    // Set the display property to none
    popup.style.display = "none";
  }, 2000);
}

// Add an event listener to the send button
Send.addEventListener("click", function() {
  // Show the popup
  showPopup();
});