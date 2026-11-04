using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AmeowPreview
{
    public sealed class InputEvent
    {
        public string Action;
        public int X, Y, Delta = 1;
    }

    public sealed class ConsoleInput : IDisposable
    {
        private const uint WaitTimeout = 258;
        private readonly IntPtr input;
        private readonly IntPtr output;
        private uint inputMode, outputMode;
        private CursorInfo cursor;
        private bool haveInputMode, haveOutputMode, haveCursor, entered, disposed;
        private uint previousButtons;

        public ConsoleInput()
        {
            input = GetStdHandle(-10);
            output = GetStdHandle(-11);
            try
            {
                if (!GetConsoleMode(input, out inputMode)) ThrowLastError();
                haveInputMode = true;
                if (!GetConsoleMode(output, out outputMode)) ThrowLastError();
                haveOutputMode = true;
                if (!GetConsoleCursorInfo(output, out cursor)) ThrowLastError();
                haveCursor = true;
                // Extended flags are required for Quick Edit to be disabled.
                uint mode = (inputMode | 0x80u | 0x08u | 0x10u) & ~(0x40u | 0x02u | 0x04u | 0x01u | 0x200u);
                if (!SetConsoleMode(input, mode)) ThrowLastError();
                if (!SetConsoleMode(output, outputMode | 0x04u)) ThrowLastError();
                entered = true;
                Console.Write("\x1b[?1049h\x1b[?25l\x1b[?1003h");
            }
            catch
            {
                Dispose();
                throw;
            }
        }

        public InputEvent Read(int timeoutMilliseconds)
        {
            if (disposed) throw new ObjectDisposedException("ConsoleInput");
            if (timeoutMilliseconds < -1) throw new ArgumentOutOfRangeException("timeoutMilliseconds");
            Stopwatch clock = Stopwatch.StartNew();
            bool first = true;
            while (true)
            {
                long remaining = timeoutMilliseconds < 0 ? -1 : timeoutMilliseconds - clock.ElapsedMilliseconds;
                if (!first && timeoutMilliseconds >= 0 && remaining <= 0) return null;
                first = false;
                uint wait = WaitForSingleObject(input, remaining < 0 ? (timeoutMilliseconds < 0 ? 0xffffffffu : 0u) : (uint)remaining);
                if (wait == WaitTimeout) return null;
                if (wait != 0) ThrowLastError();
                InputRecord record;
                uint count;
                if (!ReadConsoleInputW(input, out record, 1, out count)) ThrowLastError();
                if (count == 0) continue;
                InputEvent result = ConvertRecord(record);
                if (result != null) return result;
            }
        }

        private InputEvent ConvertRecord(InputRecord record)
        {
            if (record.Type == 4) return new InputEvent { Action = "resize" };
            if (record.Type == 1 && record.KeyDown != 0)
            {
                string action = null;
                char c = Char.ToLowerInvariant(record.Character);
                if (c == 'q' || c == 3 || (record.VirtualKey == 0x43 && (record.Controls & 0x0cu) != 0)) action = "quit";
                else if (c == 'b') action = "back";
                else if (c == 'h' || c == '?') action = "help";
                else if (c == 'n') action = "next";
                else if (c == 'p') action = "previous";
                else switch (record.VirtualKey)
                {
                    case 0x26: action = "up"; break;
                    case 0x28: action = "down"; break;
                    case 0x25: case 0x21: action = "previous"; break;
                    case 0x27: case 0x22: action = "next"; break;
                    case 0x24: action = "first"; break;
                    case 0x23: action = "last"; break;
                    case 0x0d: action = "confirm"; break;
                    case 0x1b: case 0x08: action = "back"; break;
                    case 0x51: action = "quit"; break;
                    case 0x42: action = "back"; break;
                    case 0x48: action = "help"; break;
                    case 0x4e: action = "next"; break;
                    case 0x50: action = "previous"; break;
                }
                if (action == null) return null;
                bool directional = action == "up" || action == "down" || action == "previous" || action == "next";
                return new InputEvent { Action = action, Delta = directional ? Math.Max(1, (int)record.Repeat) : 1 };
            }
            if (record.Type != 2) return null;
            uint buttons = record.Buttons & 0xffffu;
            uint oldButtons = previousButtons;
            previousButtons = buttons;
            string mouseAction = null;
            int delta = 1;
            if (record.MouseFlags == 4)
            {
                int amount = (short)(record.Buttons >> 16);
                if (amount == 0) return null;
                mouseAction = amount < 0 ? "next" : "previous";
                delta = Math.Max(1, Math.Abs(amount) / 120);
            }
            else if (record.MouseFlags == 1 && buttons == 0) mouseAction = "hover";
            else if (record.MouseFlags == 2 && buttons == 1) mouseAction = "activate";
            else if (record.MouseFlags == 0 && buttons == 1 && (oldButtons & 1) == 0) mouseAction = "click";
            if (mouseAction == null) return null;
            return new InputEvent { Action = mouseAction, X = record.MouseX - Console.WindowLeft, Y = record.MouseY - Console.WindowTop, Delta = delta };
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            if (entered)
            {
                try { Console.Write("\x1b[?1003l\x1b[0m\x1b[?1049l"); } catch { }
            }
            if (haveCursor) SetConsoleCursorInfo(output, ref cursor);
            if (haveOutputMode) SetConsoleMode(output, outputMode);
            if (haveInputMode) SetConsoleMode(input, inputMode);
        }

        private static void ThrowLastError() { throw new Win32Exception(Marshal.GetLastWin32Error()); }

        [StructLayout(LayoutKind.Sequential)]
        private struct CursorInfo { public uint Size; public int Visible; }

        [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode, Size = 20)]
        private struct InputRecord
        {
            [FieldOffset(0)] public ushort Type;
            [FieldOffset(4)] public int KeyDown;
            [FieldOffset(8)] public ushort Repeat;
            [FieldOffset(10)] public ushort VirtualKey;
            [FieldOffset(14)] public char Character;
            [FieldOffset(16)] public uint Controls;
            [FieldOffset(4)] public short MouseX;
            [FieldOffset(6)] public short MouseY;
            [FieldOffset(8)] public uint Buttons;
            [FieldOffset(16)] public uint MouseFlags;
        }

        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr GetStdHandle(int handle);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetConsoleMode(IntPtr handle, out uint mode);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetConsoleMode(IntPtr handle, uint mode);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetConsoleCursorInfo(IntPtr handle, out CursorInfo info);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetConsoleCursorInfo(IntPtr handle, ref CursorInfo info);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool ReadConsoleInputW(IntPtr handle, out InputRecord record, uint length, out uint read);
    }
}
