@echo off
setlocal

:START
cls
echo Running capture.py...
python capture.py

echo Running inference.py...
python inference.py

:ASK
set /p userInput=Do you like the predicted mask? (y/n): 
if /i "%userInput%"=="y" (

    echo Running mask.py...
    python mask.py

    echo Running video.py...
    python video.py

    goto END
) else if /i "%userInput%"=="n" (
    echo Restarting from capture.py...
    goto START
) else (
    echo Invalid input. Please enter y or n.
    goto ASK
)

:END
endlocal
pause