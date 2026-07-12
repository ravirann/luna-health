"""Deployment-compatible entrypoint for the Luna Pipecat bot."""

from dotenv import load_dotenv

from luna_bot.app import bot
from luna_bot.webrtc_compat import patch_smallwebrtc_runner_compat


load_dotenv()


if __name__ == "__main__":
    from pipecat.runner.run import main

    patch_smallwebrtc_runner_compat()
    main()
