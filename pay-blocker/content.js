(function() {
    function blockPayButton() {
      const buttons = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit']"));
      const payButton = buttons.find(btn => btn.innerText.trim() === "Pay" || btn.value?.trim() === "Pay");
  
      if (!payButton) return;
  
      const rect = payButton.getBoundingClientRect();
  
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = `${rect.top + window.scrollY}px`;
      overlay.style.left = `${rect.left + window.scrollX}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.zIndex = "9999";
      overlay.style.background = "rgba(255,255,255,0.01)";
      overlay.style.cursor = "not-allowed";
  
      overlay.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        alert("HAIYAAA 💢");
      });
  
      document.body.appendChild(overlay);
    }
  
    // Run when DOM is ready
    window.addEventListener("DOMContentLoaded", blockPayButton);
  })();
  