/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                construction: {
                    yellow: '#FFD700', // Premium Gold/Yellow (Highlight)
                    black: '#1A1A1A', // Rich Black (Primary Text/Bg)
                    grey: '#333333', // Dark Grey (Secondary)
                    light: '#F5F5F5', // Light Surface
                    yellow_hover: '#E5C100', // Darker Yellow for hover
                    danger: '#E74C3C',
                    success: '#2ECC71',
                    text: '#1A1A1A',
                    muted: '#666666',
                    surface: '#FFFFFF',
                    bg: '#FAFAFA',
                    border: '#E0E0E0',
                }
            },
            fontFamily: {
                sans: ['Roboto', 'system-ui', 'sans-serif'],
                header: ['Oswald', 'sans-serif'],
            },
            keyframes: {
                'progress-bar-stripes': {
                    '0%': { backgroundPosition: '1rem 0' },
                    '100%': { backgroundPosition: '0 0' },
                }
            },
            animation: {
                'progress-bar-stripes': 'progress-bar-stripes 1s linear infinite',
            }
        },
    },
    plugins: [],
}
