resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "app" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_instance" "web" {
  ami           = "ami-123456"
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.app.id
}

resource "aws_db_instance" "db" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
}

resource "aws_security_group" "web" {
  vpc_id = aws_vpc.main.id
}
