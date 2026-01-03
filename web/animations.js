// Using global GSAP from CDN

export const Animations = {
    // Reveal animation for file cards
    animateEntry(element) {
        gsap.fromTo(element,
            { opacity: 0, y: 20, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.7)" }
        );
    },

    // Success pulse effect
    animateSuccess(element) {
        gsap.to(element, {
            boxShadow: "0 0 20px var(--accent-primary)",
            scale: 1.05,
            duration: 0.2,
            yoyo: true,
            repeat: 1
        });
    },

    // Button loading state
    animateButtonLoading(btn, isLoading) {
        if (isLoading) {
            gsap.to(btn, { width: 60, color: "transparent", duration: 0.3 });
        } else {
            gsap.to(btn, { width: "auto", color: "white", duration: 0.3 });
        }
    },

    // Landing Page Entrance
    animateLandingText(titleSel, subSel, dropZoneSel) {
        // Simple stagger reveal
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

        tl.to(titleSel, {
            opacity: 1,
            y: 0,
            duration: 1.2,
            filter: "blur(0px)"
        })
            .to(subSel, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                filter: "blur(0px)"
            }, "-=0.8")
            .to(dropZoneSel, {
                opacity: 1,
                duration: 1,
                y: 0
            }, "-=0.6");

        // Magnetic hover effect for title (mousemove)
        const title = document.querySelector(titleSel);
        if (title) {
            title.addEventListener('mousemove', (e) => {
                const rect = title.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                gsap.to(title, {
                    x: x * 0.1,
                    y: y * 0.1,
                    textShadow: `${x * 0.05}px ${y * 0.05}px 10px rgba(0,0,0,0.1)`,
                    duration: 0.5
                });
            });
            title.addEventListener('mouseleave', () => {
                gsap.to(title, { x: 0, y: 0, textShadow: "0 0 0 rgba(0,0,0,0)", duration: 0.5 });
            });
        }
    }
};
